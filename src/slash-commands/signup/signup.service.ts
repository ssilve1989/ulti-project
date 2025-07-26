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
  ActionRowBuilder,
  DiscordjsErrorCodes,
  Embed,
  EmbedBuilder,
  type Emoji,
  Events,
  Message,
  MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  StringSelectMenuBuilder,
  User,
} from 'discord.js';
import {
  concatMap,
  debounceTime,
  fromEvent,
  groupBy,
  mergeMap,
  Subscription,
} from 'rxjs';
import { match, P } from 'ts-pattern';
import { isSameUserFilter } from '../../common/collection-filters.js';
import { getMessageLink } from '../../discord/discord.consts.js';
import { hydrateReaction, hydrateUser } from '../../discord/discord.helpers.js';
import { DiscordService } from '../../discord/discord.service.js';
import { PROG_POINT_SELECT_ID } from '../../encounters/encounters.components.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { EncountersComponentsService } from '../../encounters/encounters-components.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../../firebase/firebase.exceptions.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from './events/signup.events.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';

type ReactionEvent = {
  reaction: MessageReaction | PartialMessageReaction;
  user: User | PartialUser;
};

@Injectable()
class SignupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SignupService.name);
  private subscription?: Subscription;

  constructor(
    private readonly repository: SignupCollection,
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly eventBus: EventBus,
    private readonly encountersService: EncountersService,
    private readonly encountersComponentsService: EncountersComponentsService,
    private readonly declineReasonRequestService: DeclineReasonRequestService,
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
          duration: (group$) => group$.pipe(debounceTime(30_000)),
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

    Sentry.setExtra('message', getMessageLink(event.reaction.message));

    try {
      const [reaction, user, settings] = await Promise.all([
        hydrateReaction(event.reaction),
        hydrateUser(event.user),
        this.settingsCollection.getSettings(event.reaction.message.guildId),
      ]);

      Sentry.setUser({
        id: user.id,
        username: user.username,
      });

      const shouldHandle =
        !!settings &&
        (await this.shouldHandleReaction(
          {
            message: event.reaction.message,
            emoji: reaction.emoji,
          },
          user,
          settings,
        ));

      Sentry.setExtra('shouldHandleReaction', shouldHandle);

      return shouldHandle
        ? await this.handleReaction(reaction, user, settings)
        : undefined;
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
    const reviewChannelId = settings.reviewChannel;

    // Check that this event was the in the configured channel
    if (message.channelId !== reviewChannelId) {
      return false;
    }

    const isAllowedUser = settings?.reviewerRole
      ? await this.discordService.userHasRole({
          userId: user.id,
          roleId: settings.reviewerRole,
          guildId: message.guildId,
        })
      : // TODO: Why is this true? If the reviewerRole is not set we don't know if they have
        // permission to do this, we shouldn't let it happen
        true;

    const isExpectedReactionType =
      emoji.name === SIGNUP_REVIEW_REACTIONS.APPROVED ||
      emoji.name === SIGNUP_REVIEW_REACTIONS.DECLINED;

    const isBotReacting = message.author?.id === user.id;

    return !isBotReacting && isAllowedUser && isExpectedReactionType;
  }

  private async handleApprovedReaction(
    signup: SignupDocument,
    message: Message<true>,
    user: User,
    settings: SettingsDocument,
  ): Promise<SignupApprovedEvent> {
    const {
      embeds: [sourceEmbed],
    } = message;

    const progPoint = await this.requestProgPointConfirmation(
      signup,
      sourceEmbed,
      user,
    );

    const partyStatus = progPoint
      ? await this.getPartyStatus(signup.encounter, progPoint)
      : undefined;

    const confirmedSignup: SignupDocument = {
      ...signup,
      progPoint,
      partyStatus,
    };

    const hasCleared = partyStatus === PartyStatus.Cleared;

    if (settings.spreadsheetId) {
      await this.sheetsService.upsertSignup(
        confirmedSignup,
        settings.spreadsheetId,
      );
    }

    if (hasCleared) {
      await this.repository.removeSignup({
        character: signup.character,
        world: signup.world,
        encounter: signup.encounter,
      });
    } else {
      await this.repository.updateSignupStatus(
        SignupStatus.APPROVED,
        confirmedSignup,
        user.username,
      );
    }

    return new SignupApprovedEvent(confirmedSignup, settings, user, message);
  }

  private async handleDeclinedReaction(
    signup: SignupDocument,
    message: Message<true>,
    user: User,
  ): Promise<SignupDeclinedEvent> {
    // Update signup status immediately (for sequential reaction processing)
    await this.repository.updateSignupStatus(
      SignupStatus.DECLINED,
      signup,
      user.username,
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
    this.logger.error(error);

    const reply = match(error)
      .with(
        P.instanceOf(DocumentNotFoundException),
        () => SIGNUP_MESSAGES.SIGNUP_NOT_FOUND_FOR_REACTION,
      )
      .with(
        { code: DiscordjsErrorCodes.InteractionCollectorError },
        () => SIGNUP_MESSAGES.PROG_DM_TIMEOUT,
      )
      .otherwise(() => SIGNUP_MESSAGES.GENERIC_APPROVAL_ERROR);

    Sentry.captureMessage(reply, 'debug');

    // TODO: Improve error reporting to better inform user what happened
    await Promise.all([
      message.reactions.cache
        .get(SIGNUP_REVIEW_REACTIONS.APPROVED)
        ?.users.remove(user.id),
      this.discordService.sendDirectMessage(user.id, reply),
    ]);
  }

  @SentryTraced()
  private async requestProgPointConfirmation(
    signup: SignupDocument,
    sourceEmbed: Embed,
    user: User,
  ): Promise<string | undefined> {
    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        signup.encounter,
      );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      menu,
    );

    const embed = signup.progPoint
      ? EmbedBuilder.from(sourceEmbed).addFields([
          {
            name: 'Previously Approved Prog Point',
            value: signup.progPoint,
            inline: true,
          },
        ])
      : sourceEmbed;

    const message = await this.discordService.sendDirectMessage(user.id, {
      content: 'Please confirm the prog point of the following signup',
      embeds: [embed],
      components: [row],
    });

    try {
      const reply = await message.awaitMessageComponent({
        time: 60_000 * 2, // 2 minutes
        filter: isSameUserFilter(user),
      });

      await reply.deferReply();

      if (
        reply.customId === PROG_POINT_SELECT_ID &&
        reply.isStringSelectMenu()
      ) {
        await reply.followUp('Confirmation Received!');
        return reply.values.at(0) as string;
      }
    } finally {
      // remove the select component regardless of success or error
      await message.edit({ components: [] });
    }
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
