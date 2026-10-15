import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ApprovedSignupDocument,
  type AwaitingReviewSignupDocument,
  type DeclinedSignupDocument,
  Encounter,
  isAwaitingReview,
  PartyStatus,
  SignupStatus,
} from '@ulti-project/shared';
import {
  DiscordAPIError,
  type Emoji,
  Events,
  Message,
  MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  RESTJSONErrorCodes,
  User,
} from 'discord.js';
import { fromEvent, Subscription } from 'rxjs';
import { match } from 'ts-pattern';
import { withUnitOfWork } from '../../common/sentry.js';
import { getMessageLink } from '../../discord/discord.consts.js';
import {
  getFirstEmbed,
  hydrateReaction,
  hydrateUser,
} from '../../discord/discord.helpers.js';
import { DiscordService } from '../../discord/discord.service.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  type ApprovalDecision,
  ApprovalDecisionRequestService,
} from './approval-decision-request.service.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from './events/signup.events.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import {
  getErrorReplyMessage,
  hasClearedStatus,
  isBotReaction,
  isValidReactionEmoji,
} from './signup.utils.js';

type ReactionEvent = {
  reaction: MessageReaction | PartialMessageReaction;
  user: User | PartialUser;
};

@Injectable()
class SignupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SignupService.name);
  private subscription?: Subscription;
  private readonly reactionQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly approvalDecisionRequestService: ApprovalDecisionRequestService,
    private readonly declineReasonRequestService: DeclineReasonRequestService,
    private readonly discordService: DiscordService,
    private readonly encountersService: EncountersService,
    private readonly eventBus: EventBus,
    private readonly repository: SignupCollection,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly errorService: ErrorService,
  ) {}

  onApplicationBootstrap() {
    this.subscription = fromEvent(
      this.discordService.client,
      Events.MessageReactionAdd,
      (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
      ) => ({ reaction, user }),
    ).subscribe((event) => this.enqueueReaction(event));
  }

  /**
   * Runs reactions on the same review message one at a time. A message's entry
   * is dropped only once its chain has drained, so a reaction can never start
   * while an earlier one is still waiting on the reviewer's approval prompt.
   */
  private enqueueReaction(event: ReactionEvent): void {
    const messageId = event.reaction.message.id;
    const next = (this.reactionQueues.get(messageId) ?? Promise.resolve())
      .then(() =>
        withUnitOfWork(() =>
          Sentry.withScope((scope) => {
            // Prevent Sentry from capturing the event if we've determined we aren't going to handle it anyway.
            // Only an explicit `false` drops it: errors thrown before that check (settings, hydration, a
            // missing reviewer role) must still be reported.
            scope.addEventProcessor((event) =>
              event.extra?.shouldHandleReaction === false ? null : event,
            );

            return Sentry.startSpan({ name: Events.MessageReactionAdd }, () =>
              this.processEvent(event),
            );
          }),
        ),
      )
      // keep the chain alive for the next reaction on this message
      .catch((error: unknown) => {
        this.errorService.captureError(error);
      });

    this.reactionQueues.set(messageId, next);
    void next.then(() => {
      if (this.reactionQueues.get(messageId) === next) {
        this.reactionQueues.delete(messageId);
      }
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  async processEvent(event: ReactionEvent): Promise<void> {
    if (!event.reaction.message.inGuild()) {
      return;
    }
    const scope = Sentry.getCurrentScope();
    scope.setExtra('message', getMessageLink(event.reaction.message));

    try {
      const settings = await this.settingsCollection.getSettings(
        event.reaction.message.guildId,
      );

      if (!settings) {
        return;
      }

      const [reaction, user] = await Promise.all([
        hydrateReaction(event.reaction),
        hydrateUser(event.user),
      ]);

      scope.setUser({
        id: user.id,
        username: user.username,
      });

      const shouldHandle = await this.shouldHandleReaction(
        {
          message: event.reaction.message,
          emoji: reaction.emoji,
        },
        user,
        settings,
      );

      scope.setExtra('shouldHandleReaction', shouldHandle);

      if (shouldHandle) {
        await this.handleReaction(reaction, user, settings);
      }
    } catch (error) {
      await this.handleError(error, event.user, event.reaction.message);
    }
  }

  @SentryTraced()
  private async handleReaction(
    { message, emoji }: MessageReaction,
    user: User,
    settings: SettingsDocument,
  ) {
    if (!message.inGuild()) {
      this.logger.warn(`message ${message.id} is not in a guild`);
      return;
    }

    // TODO: If for some reason this throws and there is no signup, we should inform the person performing the interaction
    // that there is no associated signup anymore
    const signup = await this.repository.findByReviewId(message.id);

    if (!isAwaitingReview(signup)) {
      this.logger.log(
        `signup ${signup.reviewMessageId} already reviewed by ${user.displayName}`,
      );
      return;
    }

    const event = await match(emoji.name)
      .with(SIGNUP_REVIEW_REACTIONS.APPROVED, () =>
        this.handleApprovedReaction(signup, message, user, settings),
      )
      .with(SIGNUP_REVIEW_REACTIONS.DECLINED, () =>
        this.handleDeclinedReaction(signup, message, user),
      )
      .otherwise(() => undefined);

    event && this.eventBus.publish(event);
  }

  private async shouldHandleReaction(
    { message, emoji }: { message: Message<true>; emoji: Emoji },
    user: User,
    settings: SettingsDocument,
  ): Promise<boolean> {
    // Check that this event was in the configured review channel
    if (message.channelId !== settings.reviewChannel) {
      return false;
    }

    // Check if reaction is from the bot itself
    if (isBotReaction(message.author?.id ?? '', user.id)) {
      return false;
    }

    // Check if emoji is a valid review reaction
    if (!isValidReactionEmoji(emoji.name)) {
      return false;
    }

    // only a review reaction needs the role, so the bot's own reactions (and
    // stray emoji) don't fail when it's missing
    if (!settings.reviewerRole) {
      throw new Error(
        `No reviewer role configured for guild: ${message.guildId}`,
      );
    }

    // Check if user has reviewer role
    return await this.discordService.userHasRole({
      userId: user.id,
      roleId: settings.reviewerRole,
      guildId: message.guildId,
    });
  }

  private async handleApprovedReaction(
    signup: AwaitingReviewSignupDocument,
    message: Message<true>,
    user: User,
    settings: SettingsDocument,
  ): Promise<SignupApprovedEvent | undefined> {
    const decision = await this.confirmProgPoint(signup, message, user);

    if (decision.type === 'cancelled') {
      // No DM here: the Cancel button's own followUp already confirmed the
      // cancellation to the reviewer in the DM thread. Swallow (but report)
      // a revert failure rather than letting it propagate to handleError,
      // which would DM a contradictory "something went wrong" on top of the
      // cancellation confirmation the reviewer already received.
      try {
        await this.revertReviewReaction(user, message);
      } catch (error) {
        this.errorService.captureError(error);
      }
      return undefined;
    }

    const approvedSignup = await this.buildApprovedSignup(
      signup,
      message,
      user,
      decision.progPoint,
    );
    const persisted = await this.persistApprovedSignup(
      approvedSignup,
      settings,
      user,
      message.id,
    );

    if (!persisted) {
      await this.rejectStaleReview(signup, message, user);
      return undefined;
    }

    return new SignupApprovedEvent(
      approvedSignup,
      settings,
      user,
      message,
      decision.comment,
    );
  }

  private async confirmProgPoint(
    signup: AwaitingReviewSignupDocument,
    message: Message<true>,
    user: User,
  ): Promise<ApprovalDecision> {
    const sourceEmbed = getFirstEmbed(message);

    return await this.approvalDecisionRequestService.requestApprovalDecision(
      signup,
      sourceEmbed,
      user,
    );
  }

  private async buildApprovedSignup(
    signup: AwaitingReviewSignupDocument,
    message: Message<true>,
    user: User,
    progPoint: string | undefined,
  ): Promise<ApprovedSignupDocument> {
    const partyStatus = progPoint
      ? await this.getPartyStatus(signup.encounter, progPoint)
      : undefined;

    return {
      ...signup,
      status: SignupStatus.APPROVED,
      reviewMessageId: signup.reviewMessageId ?? message.id,
      reviewedBy: user.username,
      progPoint,
      partyStatus,
    };
  }

  private async persistApprovedSignup(
    confirmedSignup: ApprovedSignupDocument,
    settings: SettingsDocument,
    user: User,
    reviewMessageId: string,
  ): Promise<boolean> {
    const hasCleared = hasClearedStatus(confirmedSignup);

    // Firestore is the source of truth, so a stale review must be rejected
    // there before anything reaches the sheet.
    if (!hasCleared) {
      const approved = await this.repository.approveSignup(
        {
          discordId: confirmedSignup.discordId,
          encounter: confirmedSignup.encounter,
          partyStatus: confirmedSignup.partyStatus,
          progPoint: confirmedSignup.progPoint,
        },
        user.username,
        reviewMessageId,
      );

      if (!approved) {
        return false;
      }
    }

    if (settings.spreadsheetId) {
      await this.sheetsService.upsertSignup(
        confirmedSignup,
        settings.spreadsheetId,
      );
    }

    if (hasCleared) {
      await this.repository.removeSignup({
        character: confirmedSignup.character,
        world: confirmedSignup.world,
        encounter: confirmedSignup.encounter,
      });
    }

    return true;
  }

  private async handleDeclinedReaction(
    signup: AwaitingReviewSignupDocument,
    message: Message<true>,
    user: User,
  ): Promise<SignupDeclinedEvent | undefined> {
    const declinedSignup = this.buildDeclinedSignup(signup, user);

    // Update signup status immediately (for sequential reaction processing)
    const declined = await this.repository.declineSignup(
      {
        discordId: declinedSignup.discordId,
        encounter: declinedSignup.encounter,
      },
      user.username,
      message.id,
    );

    if (!declined) {
      await this.rejectStaleReview(signup, message, user);
      return undefined;
    }

    // Fire decline reason request with event dispatch context (non-blocking)
    this.declineReasonRequestService
      .requestDeclineReason(declinedSignup, user, message)
      .catch((error) => {
        this.logger.error(
          error,
          `Failed to request decline reason for signup ${declinedSignup.discordId}-${declinedSignup.encounter}`,
        );
      });

    // Return event immediately for embed footer update
    return new SignupDeclinedEvent(declinedSignup, user, message);
  }

  private buildDeclinedSignup(
    signup: AwaitingReviewSignupDocument,
    user: User,
  ): DeclinedSignupDocument {
    return {
      ...signup,
      status: SignupStatus.DECLINED,
      reviewedBy: user.username,
    };
  }

  private async handleError(
    error: unknown,
    user: User | PartialUser,
    message: Message | PartialMessage,
  ): Promise<void> {
    const reply = getErrorReplyMessage(error);

    Sentry.getCurrentScope().setContext('reply', { reply });
    this.errorService.captureError(error);

    // TODO: Improve error reporting to better inform user what happened
    const results = await Promise.allSettled([
      this.revertReviewReaction(user, message),
      this.discordService.sendDirectMessage(user.id, reply),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.errorService.captureError(result.reason);
      }
    }
  }

  /** The signup was resubmitted or reviewed by someone else while this reviewer was deciding. */
  private async rejectStaleReview(
    signup: AwaitingReviewSignupDocument,
    message: Message<true>,
    user: User,
  ): Promise<void> {
    await Promise.all([
      this.revertReviewReaction(user, message).catch((error: unknown) => {
        // a resubmit deletes the old review message, so there's no reaction left to take back
        if (
          !(error instanceof DiscordAPIError) ||
          error.code !== RESTJSONErrorCodes.UnknownMessage
        ) {
          throw error;
        }
      }),
      this.discordService.sendDirectMessage(
        user.id,
        `${SIGNUP_MESSAGES.REVIEW_NOT_RECORDED}\n\nSignup: **${signup.encounter}** by **${signup.username}**`,
      ),
    ]);
  }

  private async revertReviewReaction(
    user: User | PartialUser,
    message: Message | PartialMessage,
  ): Promise<void> {
    await Promise.all([
      message.reactions.cache
        .get(SIGNUP_REVIEW_REACTIONS.APPROVED)
        ?.users.remove(user.id),
      message.reactions.cache
        .get(SIGNUP_REVIEW_REACTIONS.DECLINED)
        ?.users.remove(user.id),
    ]);
  }

  private async getPartyStatus(
    encounter: Encounter,
    progPoint: string,
  ): Promise<PartyStatus> {
    if (progPoint === PartyStatus.Cleared) {
      return PartyStatus.Cleared;
    }

    return await this.encountersService.getPartyStatusForProgPoint(
      encounter,
      progPoint,
    );
  }
}

export { SignupService };
