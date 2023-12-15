import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  Colors,
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
import { match } from 'ts-pattern';
import { DiscordService } from '../discord/discord.service.js';
import { SIGNUP_REVIEW_REACTIONS, SignupStatus } from './signup.consts.js';
import { Signup } from './signup.interfaces.js';
import { SignupRepository } from './signup.repository.js';
import { SettingsService } from '../settings/settings.service.js';

@Injectable()
class SignupReviewService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SignupReviewService.name);
  private subscription?: Subscription;

  constructor(
    private readonly repository: SignupRepository,
    private readonly discordService: DiscordService,
    private readonly settingsService: SettingsService,
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
          const [reaction, user] = await Promise.all([
            this.hydrateReaction(event.reaction),
            this.hydrateUser(event.user),
          ]);
          const shouldHandle = await this.shouldHandleReaction(reaction, user);
          return shouldHandle ? this.handleReaction(reaction, user) : EMPTY;
        }),
      )
      .subscribe();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  private async handleReaction(
    reactionOrPartial: MessageReaction | PartialMessageReaction,
    userOrPartial: User | PartialUser,
  ) {
    const [{ message, emoji }, user] = await Promise.all([
      this.hydrateReaction(reactionOrPartial),
      this.hydrateUser(userOrPartial),
    ]);

    const signup = await this.repository.findByReviewId(message.id);

    if (signup.reviewedBy) {
      this.logger.log(
        `signup ${signup.reviewMessageId} already reviewed by ${user.displayName}`,
      );
      return;
    }

    try {
      await match(emoji.name)
        .with(SIGNUP_REVIEW_REACTIONS.APPROVED, () =>
          this.handleApprovedReaction(signup, message, user),
        )
        .with(SIGNUP_REVIEW_REACTIONS.DECLINED, () =>
          this.handleDeclinedReaction(signup, message, user),
        )
        .otherwise(() => {});
    } catch (error) {
      this.handleReactionError(error, message);
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
  ) {
    if (!reaction.message.inGuild()) return false;

    const reviewerRoleId = await this.settingsService.getReviewerRole(
      reaction.message.guildId,
    );

    const isAllowedUser = reviewerRoleId
      ? await this.discordService.userHasRole(user.id, reviewerRoleId)
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
  ) {
    // otherwise approve this signup and update the embedded messag with a footer of who approved it
    await this.repository.updateSignupStatus(
      SignupStatus.APPROVED,
      signup,
      user.username,
    );

    const embed = EmbedBuilder.from(message.embeds[0]);
    const displayName = await this.discordService.getDisplayName(user.id);

    embed
      .setFooter({
        text: `Approved by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setDescription(null)
      .setColor(Colors.Green)
      .setTimestamp(new Date());

    await message.edit({ embeds: [embed] });
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
    message: Message | PartialMessage,
  ) {
    this.logger.error(error);
    // TODO: consolidate error messages to consts
    await message.reply('Sorry an unexpected error has occurred');
  }
}

export { SignupReviewService };
