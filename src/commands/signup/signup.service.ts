import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import {
  ActionRowBuilder,
  Colors,
  DiscordjsError,
  DiscordjsErrorCodes,
  Embed,
  EmbedBuilder,
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
import { isSameUserFilter } from '../../common/collection-filters.js';
import { hydrateReaction, hydrateUser } from '../../discord/discord.helpers.js';
import { DiscordService } from '../../discord/discord.service.js';
import {
  EncounterProgMenus,
  PROG_POINT_SELECT_ID,
} from '../../encounters/encounters.components.js';
import { EncounterProgPoints } from '../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SheetsService } from '../../sheets/sheets.service.js';
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
              if (!event.reaction.message.inGuild()) return EMPTY;

              // TODO: dangerous cast to Settings, but know its safe from current usage
              // attempts to type it correctly just result in weirdness since all the other fields on the object are optional
              const [reaction, user, settings = {} as SettingsDocument] =
                await Promise.all([
                  hydrateReaction(event.reaction),
                  hydrateUser(event.user),
                  this.settingsCollection.getSettings(
                    event.reaction.message.guildId,
                  ),
                ]);

              const shouldHandle = await this.shouldHandleReaction(
                reaction,
                user,
                settings,
              );

              return shouldHandle
                ? this.handleReaction(reaction, user, settings)
                : EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  private async handleReaction(
    { message, emoji }: MessageReaction,
    user: User,
    settings: SettingsDocument,
  ) {
    try {
      // TODO: If for some reason this throws and there is no signup, we should inform the person performing the interaction
      // that there is no associated signup anymore
      const signup = await this.repository.findByReviewId(message.id);

      if (signup.reviewedBy) {
        this.logger.log(
          `signup ${signup.reviewMessageId} already reviewed by ${user.displayName}`,
        );
        return;
      }

      await match(emoji.name)
        .with(SIGNUP_REVIEW_REACTIONS.APPROVED, () =>
          this.handleApprovedReaction(signup, message, user, settings),
        )
        .with(SIGNUP_REVIEW_REACTIONS.DECLINED, () =>
          this.handleDeclinedReaction(signup, message, user),
        )
        .otherwise(() => {});
    } catch (error) {
      this.handleReactionError(error, user, message);
    }
  }

  private async shouldHandleReaction(
    reaction: MessageReaction,
    user: User | PartialUser,
    settings: SettingsDocument,
  ) {
    if (!reaction.message.inGuild()) return false;

    const isAllowedUser = settings?.reviewerRole
      ? await this.discordService.userHasRole(user.id, settings.reviewerRole)
      : true;

    const isExpectedReactionType =
      reaction.emoji.name === SIGNUP_REVIEW_REACTIONS.APPROVED ||
      reaction.emoji.name === SIGNUP_REVIEW_REACTIONS.DECLINED;

    const isBotReacting = reaction.message.author?.id === user.id;

    return !isBotReacting && isAllowedUser && isExpectedReactionType;
  }

  private async handleApprovedReaction(
    signup: SignupDocument,
    message: Message | PartialMessage,
    user: User,
    settings: SettingsDocument,
  ) {
    if (!message.inGuild()) {
      this.logger.warn(
        `received message that was not part of a guild: ${message.content}`,
      );

      return;
    }

    const [sourceEmbed] = message.embeds;
    const embed = EmbedBuilder.from(sourceEmbed);

    const [displayName, progPoint] = await Promise.all([
      this.discordService.getDisplayName(user.id),
      this.requestProgPointConfirmation(signup, sourceEmbed, user),
    ]);

    const partyType =
      (progPoint &&
        EncounterProgPoints[signup.encounter][progPoint]?.partyType) ||
      undefined;

    this.logger.debug(
      `querying partyType for progPoint: ${progPoint}, ${partyType}`,
    );

    const confirmedSignup: SignupDocument = { ...signup, progPoint, partyType };

    embed
      .setFooter({
        text: `Approved by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setDescription(null)
      .setColor(Colors.Green)
      .setTimestamp(new Date());

    if (partyType) {
      embed.addFields([{ name: 'Party Type', value: partyType, inline: true }]);
    }

    const [publicSignupChannel] = await Promise.all([
      settings.signupChannel &&
        this.discordService.getTextChannel(settings.signupChannel),
      settings.spreadsheetId &&
        this.sheetsService.upsertSignup(
          confirmedSignup,
          settings.spreadsheetId,
        ),
    ]);

    await this.repository.updateSignupStatus(
      SignupStatus.APPROVED,
      confirmedSignup,
      user.username,
    );

    await Promise.all([
      message.edit({ embeds: [embed] }),
      // biome-ignore lint/complexity/useOptionalChain: using optional chaining doesn't properly handle asserting the type of the channel
      publicSignupChannel &&
        publicSignupChannel.send({
          content: `<@${confirmedSignup.discordId}> Signup Approved!`,
          embeds: [embed],
        }),
      this.assignProgRole(message.guild.id, settings, signup),
    ]);
  }

  private async handleDeclinedReaction(
    signup: SignupDocument,
    message: Message | PartialMessage,
    user: User,
  ) {
    const [displayName] = await Promise.all([
      this.discordService.getDisplayName(user.id),
      this.repository.updateSignupStatus(
        SignupStatus.DECLINED,
        signup,
        user.username,
      ),
    ]);

    const embed = EmbedBuilder.from(message.embeds[0])
      .setDescription(null)
      .setFooter({
        text: `Declined by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setColor(Colors.Red)
      .setTimestamp(new Date());

    await Promise.all([
      message.edit({ embeds: [embed] }),
      this.discordService.sendDirectMessage(signup.discordId, {
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED,
        embeds: [embed.setTitle('Signup Declined')],
      }),
    ]);
  }

  private async handleReactionError(
    error: unknown,
    user: User,
    message: Message | PartialMessage,
  ) {
    sentryReport(error, { userId: user.username });

    this.logger.error(error);

    const reply = match(error)
      .with(
        P.instanceOf(DiscordjsError),
        ({ code }) => code === DiscordjsErrorCodes.InteractionCollectorError,
        () => SIGNUP_MESSAGES.PROG_SELECTION_TIMEOUT,
      )
      .otherwise(() => SIGNUP_MESSAGES.GENERIC_APPROVAL_ERROR);

    // TODO: Improve error reporting to better inform user what happened
    await Promise.all([
      message.reactions.cache
        .get(SIGNUP_REVIEW_REACTIONS.APPROVED)
        ?.users.remove(user.id),

      this.discordService.sendDirectMessage(user.id, reply),
    ]);
  }

  private async requestProgPointConfirmation(
    signup: SignupDocument,
    sourceEmbed: Embed,
    user: User,
  ): Promise<string | undefined> {
    const menu = EncounterProgMenus[signup.encounter];

    const row = new ActionRowBuilder().addComponents(menu);

    const embed = EmbedBuilder.from(sourceEmbed).addFields([
      {
        name: 'Prog Point',
        value: signup.progPointRequested,
        inline: true,
      },
    ]);

    const message = await this.discordService.sendDirectMessage(user.id, {
      content: 'Please confirm the prog point of the following signup',
      embeds: [embed],
      components: [row as any],
    });

    try {
      const reply = await message.awaitMessageComponent({
        time: 60_000,
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

      await reply.update(SIGNUP_MESSAGES.UNEXPECTED_PROG_SELECTION_ERROR);
    } catch (error) {
      sentryReport(error, {
        userId: user.username,
        extra: { encounter: signup.encounter, discordId: signup.discordId },
      });

      this.logger.error(error);

      await match(error)
        .with(
          P.instanceOf(DiscordjsError),
          ({ code }) => code === DiscordjsErrorCodes.InteractionCollectorError,
          () =>
            message.edit({
              content: `:exclamation: **IMPORTANT**: ${SIGNUP_MESSAGES.PROG_SELECTION_TIMEOUT} :exclamation:`,
              components: [],
            }),
        )
        .otherwise(() =>
          this.discordService.sendDirectMessage(
            user.id,
            SIGNUP_MESSAGES.UNEXPECTED_PROG_SELECTION_ERROR,
          ),
        );
    }
  }

  private async assignProgRole(
    guildId: string,
    settings: Pick<SettingsDocument, 'progRoles'>,
    { encounter, discordId }: Pick<SignupDocument, 'encounter' | 'discordId'>,
  ) {
    const role = settings.progRoles?.[encounter];
    if (!role) return;

    try {
      const member = await this.discordService.getGuildMember(
        discordId,
        guildId,
      );

      if (member) {
        await member.roles.add(role);
      }
    } catch (e) {
      sentryReport(e, { extra: { encounter, discordId } });
      this.logger.error(e);
    }
  }
}

export { SignupService };
