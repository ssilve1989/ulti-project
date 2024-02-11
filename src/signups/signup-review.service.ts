import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
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
import { EMPTY, Subscription, concatMap, fromEvent } from 'rxjs';
import { P, match } from 'ts-pattern';
import { DiscordService } from '../discord/discord.service.js';
import { SIGNUP_REVIEW_REACTIONS, SignupStatus } from './signup.consts.js';
import { Signup } from './signup.interfaces.js';
import { SignupRepository } from './signup.repository.js';
import { SettingsService } from '../settings/settings.service.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { Settings } from '../settings/settings.interfaces.js';
import {
  EncounterProgMenus,
  PROG_POINT_SELECT_ID,
} from '../encounters/encounters.components.js';
import { isSameUserFilter } from '../common/collection-filters.js';

@Injectable()
class SignupReviewService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SignupReviewService.name);
  private subscription?: Subscription;

  constructor(
    private readonly repository: SignupRepository,
    private readonly discordService: DiscordService,
    private readonly settingsService: SettingsService,
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
        concatMap(async (event) => {
          if (!event.reaction.message.inGuild()) return EMPTY;

          const [reaction, user, settings] = await Promise.all([
            this.hydrateReaction(event.reaction),
            this.hydrateUser(event.user),
            this.settingsService.getSettings(event.reaction.message.guildId),
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
      )
      .subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  private async handleReaction(
    { message, emoji }: MessageReaction,
    user: User,
    settings?: Settings,
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

  private hydrateReaction(
    reaction: MessageReaction | PartialMessageReaction,
  ): Promise<MessageReaction> {
    if (reaction.partial) {
      return reaction.fetch();
    } else {
      return Promise.resolve(reaction);
    }
  }

  private hydrateUser(user: User | PartialUser): Promise<User> {
    if (user.partial) {
      return user.fetch();
    } else {
      return Promise.resolve(user);
    }
  }

  private async shouldHandleReaction(
    reaction: MessageReaction,
    user: User | PartialUser,
    settings?: Settings,
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
    signup: Signup,
    message: Message | PartialMessage,
    user: User,
    settings?: Settings,
  ) {
    const [sourceEmbed] = message.embeds;
    const embed = EmbedBuilder.from(sourceEmbed);
    const displayName = await this.discordService.getDisplayName(user.id);

    const progPoint = await this.requestProgPointConfirmation(
      signup,
      sourceEmbed,
      user,
    );

    const confirmedSignup: Signup = { ...signup, progPoint };

    embed
      .setFooter({
        text: `Approved by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setDescription(null)
      .setColor(Colors.Green)
      .setTimestamp(new Date());

    try {
      if (settings?.spreadsheetId) {
        await this.sheetsService.upsertSignup(
          confirmedSignup,
          settings.spreadsheetId,
        );
      }

      await this.repository.updateSignupStatus(
        SignupStatus.APPROVED,
        confirmedSignup,
        user.username,
      );

      await message.edit({ embeds: [embed] });
    } catch (e) {
      // if there was an error posting to the google sheet, undo the reaction and let the user that reacted know
      this.logger.error(e);

      await Promise.all([
        message.reactions.cache
          .get(SIGNUP_REVIEW_REACTIONS.APPROVED)
          ?.users.remove(user.id),
        this.discordService.sendDirectMessage(
          user.id,
          `There was an error posting [this signup](${message.url}) to Google Sheets. Your approval has not been recorded`,
        ),
      ]);
    }
  }

  private async handleDeclinedReaction(
    signup: Signup,
    message: Message | PartialMessage,
    user: User,
  ) {
    await this.repository.updateSignupStatus(
      SignupStatus.DECLINED,
      signup,
      user.username,
    );

    const displayName = await this.discordService.getDisplayName(user.id);
    const embed = EmbedBuilder.from(message.embeds[0])
      .setDescription(null)
      .setFooter({
        text: `Declined by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setColor(Colors.Red)
      .setTimestamp(new Date());

    await message.edit({ embeds: [embed] });
  }

  private async handleReactionError(
    error: unknown,
    user: User,
    message: Message | PartialMessage,
  ) {
    this.logger.error(error);
    // TODO: Improve error reporting to better inform user what happened
    await Promise.all([
      message.reactions.cache
        .get(SIGNUP_REVIEW_REACTIONS.APPROVED)
        ?.users.remove(user.id),

      this.discordService.sendDirectMessage(
        user.id,
        `There was an error handling [this signup](${message.url}). Your approval has not been recorded`,
      ),
    ]);
  }

  private async requestProgPointConfirmation(
    signup: Signup,
    embed: Embed,
    user: User,
  ): Promise<string | undefined> {
    const menu = EncounterProgMenus[signup.encounter];

    const row = new ActionRowBuilder().addComponents(menu);

    try {
      const message = await this.discordService.sendDirectMessage(user.id, {
        content: 'Please confirm the prog point of the following signup',
        embeds: [embed],
        components: [row as any],
      });

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

      await reply.update(
        'Unable to determine prog point selection. This could be an internal error. Please report this as an error and manually update the prog on the google sheet',
      );
    } catch (error) {
      this.logger.error(error);

      await match(error)
        .with(
          P.instanceOf(DiscordjsError),
          ({ code }) => code === DiscordjsErrorCodes.InteractionCollectorError,
          () =>
            this.discordService.sendDirectMessage(
              user.id,
              "You didn't respond in time. Please manually update the google sheet with the intended prog point",
            ),
        )
        .otherwise(() =>
          this.discordService.sendDirectMessage(
            user.id,
            'Sorry an unexpected error has occurred. Please report this problem and manually update the google sheet with the intended prog point ',
          ),
        );
    }
  }
}

export { SignupReviewService };
