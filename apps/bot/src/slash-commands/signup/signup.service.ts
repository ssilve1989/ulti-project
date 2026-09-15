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
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  type Emoji,
  Events,
  Message,
  MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  User,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import {
  concatMap,
  debounceTime,
  fromEvent,
  groupBy,
  mergeMap,
  Subscription,
} from 'rxjs';
import { match } from 'ts-pattern';
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
  APPROVAL_DECISION_TIMEOUT_MS,
  type ApprovalDecision,
  ApprovalDecisionRequestService,
} from './approval-decision-request.service.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from './events/signup.events.js';
import { withTrackingSeed } from './review-history.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import {
  getErrorReplyMessage,
  isBotReaction,
  isValidReactionEmoji,
} from './signup.utils.js';

type ReactionEvent = {
  reaction: MessageReaction | PartialMessageReaction;
  user: User | PartialUser;
};

type ConfirmedSignup = SignupDocument & {
  progPoint: string;
  partyStatus: PartyStatus;
};

// A reaction group's `duration` notifier only resubscribes on new group
// events (see rxjs groupBy.js), so it can close a group while its `concatMap`
// handler is still awaiting the approval decision DM. The idle window must
// outlive that DM (APPROVAL_DECISION_TIMEOUT_MS) plus the post-decision
// persistence work (Sheets queue + Firestore), or a reaction arriving after
// the group closes starts a second, concurrent handler for the same message.
const REACTION_GROUP_IDLE_MS = APPROVAL_DECISION_TIMEOUT_MS + 5 * 60 * 1000;

@Injectable()
class SignupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SignupService.name);
  private subscription?: Subscription;

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
    )
      .pipe(
        groupBy(({ reaction }) => reaction.message.id, {
          duration: (group$) =>
            group$.pipe(debounceTime(REACTION_GROUP_IDLE_MS)),
        }),
        mergeMap((group$) =>
          group$.pipe(
            concatMap((event) =>
              Sentry.startNewTrace(() =>
                Sentry.withScope((scope) => {
                  // Prevent Sentry from capturing the event if we've determined we aren't going to handle it anyway
                  scope.addEventProcessor((event) =>
                    event.extra?.shouldHandleReaction ? event : null,
                  );

                  return Sentry.startSpan(
                    { name: Events.MessageReactionAdd },
                    () => this.processEvent(event),
                  );
                }),
              ),
            ),
          ),
        ),
      )
      .subscribe();
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
      this.handleError(error, event.user, event.reaction.message);
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

    if (signup.reviewedBy) {
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

    if (!settings.reviewerRole) {
      throw new Error(
        `No reviewer role configured for guild: ${message.guildId}`,
      );
    }

    // Check if reaction is from the bot itself
    if (isBotReaction(message.author?.id ?? '', user.id)) {
      return false;
    }

    // Check if emoji is a valid review reaction
    if (!isValidReactionEmoji(emoji.name)) {
      return false;
    }

    // Check if user has reviewer role
    return await this.discordService.userHasRole({
      userId: user.id,
      roleId: settings.reviewerRole,
      guildId: message.guildId,
    });
  }

  private async handleApprovedReaction(
    signup: SignupDocument,
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

    const confirmedSignup = await this.buildConfirmedSignup(
      signup,
      decision.progPoint,
    );
    await this.persistApprovedSignup(signup, confirmedSignup, settings, user);

    return new SignupApprovedEvent(
      confirmedSignup,
      settings,
      user,
      message,
      decision.comment,
    );
  }

  private async confirmProgPoint(
    signup: SignupDocument,
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

  private async buildConfirmedSignup(
    signup: SignupDocument,
    progPoint: string,
  ): Promise<ConfirmedSignup> {
    const partyStatus = await this.getPartyStatus(signup.encounter, progPoint);

    return {
      ...signup,
      progPoint,
      partyStatus,
    };
  }

  private async persistApprovedSignup(
    signup: SignupDocument,
    confirmedSignup: ConfirmedSignup,
    settings: SettingsDocument,
    user: User,
  ): Promise<void> {
    if (settings.spreadsheetId) {
      await this.sheetsService.upsertSignup(
        confirmedSignup,
        settings.spreadsheetId,
      );
    }

    const hasCleared = confirmedSignup.partyStatus === PartyStatus.Cleared;

    if (hasCleared) {
      await this.repository.removeSignup({
        character: confirmedSignup.character,
        world: confirmedSignup.world,
        encounter: confirmedSignup.encounter,
      });
    } else {
      const at = Timestamp.now();
      // seed from `signup` (as read), not `confirmedSignup` (new prog point)
      await this.repository.updateSignupStatus(
        SignupStatus.APPROVED,
        confirmedSignup,
        user.username,
        withTrackingSeed(
          signup,
          {
            type: 'approved',
            progPoint: confirmedSignup.progPoint,
            partyStatus: confirmedSignup.partyStatus,
            actorId: user.id,
            at,
            via: 'reaction',
          },
          at,
        ),
      );
    }
  }

  private async handleDeclinedReaction(
    signup: SignupDocument,
    message: Message<true>,
    user: User,
  ): Promise<SignupDeclinedEvent> {
    // Update signup status immediately (for sequential reaction processing)
    const at = Timestamp.now();
    await this.repository.updateSignupStatus(
      SignupStatus.DECLINED,
      signup,
      user.username,
      withTrackingSeed(
        signup,
        { type: 'declined', actorId: user.id, at, via: 'reaction' },
        at,
      ),
    );

    // Fire decline reason request with event dispatch context (non-blocking)
    this.declineReasonRequestService
      .requestDeclineReason(signup, user, message)
      .catch((error) => {
        this.logger.error(
          error,
          `Failed to request decline reason for signup ${signup.discordId}-${signup.encounter}`,
        );
      });

    // Return event immediately for embed footer update
    return new SignupDeclinedEvent(signup, user, message);
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
    await Promise.all([
      this.revertReviewReaction(user, message),
      this.discordService.sendDirectMessage(user.id, reply),
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
