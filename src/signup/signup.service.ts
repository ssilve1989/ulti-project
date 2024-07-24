import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import {
  ActionRowBuilder,
  DiscordjsErrorCodes,
  Embed,
  Events,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';
import {
  EMPTY,
  Subscription,
  concatMap,
  debounceTime,
  fromEvent,
  groupBy,
  mergeMap,
} from 'rxjs';
import { P, match } from 'ts-pattern';
import { isSameUserFilter } from '../common/collection-filters.js';
import { getMessageLink } from '../discord/discord.consts.js';
import { hydrateReaction, hydrateUser } from '../discord/discord.helpers.js';
import { DiscordService } from '../discord/discord.service.js';
import {
  EncounterProgMenus,
  PROG_POINT_SELECT_ID,
} from '../encounters/encounters.components.js';
import {
  Encounter,
  EncounterProgPoints,
} from '../encounters/encounters.consts.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { SignupCollection } from '../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../firebase/firebase.exceptions.js';
import { SettingsDocument } from '../firebase/models/settings.model.js';
import {
  PartyStatus,
  SignupDocument,
  SignupStatus,
} from '../firebase/models/signup.model.js';
import { SentryTraced } from '../observability/span.decorator.js';
import { SheetsService } from '../sheets/sheets.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from './events/signup.events.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';

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
            concatMap(async (event) => {
              return Sentry.startNewTrace(() => {
                return Sentry.withScope((scope) => {
                  return Sentry.startSpan(
                    { name: Events.MessageReactionAdd },
                    // TODO: Abstract anon functions to reduce complexity warning
                    async () => {
                      if (!event.reaction.message.inGuild()) {
                        return EMPTY;
                      }

                      scope.setExtras({
                        message: getMessageLink(event.reaction.message),
                      });

                      try {
                        // TODO: dangerous cast to Settings, but know its safe from current usage
                        // attempts to type it correctly just result in weirdness since all the other fields on the object are optional
                        const [
                          reaction,
                          user,
                          settings = {} as SettingsDocument,
                        ] = await Promise.all([
                          hydrateReaction(event.reaction),
                          hydrateUser(event.user),
                          this.settingsCollection.getSettings(
                            event.reaction.message.guildId,
                          ),
                        ]);

                        scope.setUser({
                          id: user.id,
                          username: user.username,
                        });

                        // TODO: We can extract the type of the Message to be `Message<True>` since shouldHandleReaction checks if the message is inGuild()
                        const shouldHandle = await this.shouldHandleReaction(
                          reaction,
                          user,
                          settings,
                        );

                        return shouldHandle
                          ? await this.handleReaction(reaction, user, settings)
                          : EMPTY;
                      } catch (error) {
                        this.handleError(
                          error,
                          event.user,
                          event.reaction.message,
                        );
                      }
                    },
                  );
                });
              });
            }),
          ),
        ),
      )
      .subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
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
    { message, emoji }: MessageReaction,
    user: User,
    settings: SettingsDocument,
  ) {
    const reviewChannelId = settings.reviewChannel;

    // Check that this event originated from a server and was the in the configured channel
    if (!message.inGuild() || message.channelId !== reviewChannelId) {
      return false;
    }

    const isAllowedUser = settings?.reviewerRole
      ? await this.discordService.userHasRole({
          userId: user.id,
          roleId: settings.reviewerRole,
          guildId: message.guildId,
        })
      : true;

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
      ? this.getPartyStatus(signup.encounter, progPoint)
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
      await this.repository.removeSignup(signup);
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
    await this.repository.updateSignupStatus(
      SignupStatus.DECLINED,
      signup,
      user.username,
    );

    return new SignupDeclinedEvent(signup, user, message);
  }

  private async handleError(
    error: unknown,
    user: User | PartialUser,
    message: Message | PartialMessage,
  ) {
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

    Sentry.getCurrentScope().captureMessage(reply, 'debug');

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
    const menu = EncounterProgMenus[signup.encounter];
    const row = new ActionRowBuilder().addComponents(menu);

    const message = await this.discordService.sendDirectMessage(user.id, {
      content: 'Please confirm the prog point of the following signup',
      embeds: [sourceEmbed],
      components: [row as any],
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
    } catch (error) {
      // if we encounter any error with the DM just remove the select component so they don't get further errors upon
      // trying to select again
      await message.edit({ components: [] });
      throw error;
    }
  }

  private getPartyStatus(encounter: Encounter, progPoint: string) {
    return progPoint === PartyStatus.Cleared
      ? PartyStatus.Cleared
      : EncounterProgPoints[encounter][progPoint]?.partyStatus;
  }
}

export { SignupService };
