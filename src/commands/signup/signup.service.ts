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
import { ClearReactions } from '../../common/emojis/emojis.js';
import { getMessageLink } from '../../discord/discord.consts.js';
import { hydrateReaction, hydrateUser } from '../../discord/discord.helpers.js';
import { DiscordService } from '../../discord/discord.service.js';
import {
  EncounterProgMenus,
  PROG_POINT_SELECT_ID,
} from '../../encounters/encounters.components.js';
import {
  Encounter,
  EncounterFriendlyDescription,
  EncounterProgPoints,
} from '../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../../firebase/firebase.exceptions.js';
import { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  PartyStatus,
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
              // TODO: cleanup this anon function
              await Sentry.withScope(async (scope) => {
                if (!event.reaction.message.inGuild()) {
                  return EMPTY;
                }

                scope.setExtras({
                  message: getMessageLink(event.reaction.message),
                });

                try {
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
                  this.handleError(error, event.user, event.reaction.message);
                }
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

    await match(emoji.name)
      .with(SIGNUP_REVIEW_REACTIONS.APPROVED, () =>
        this.handleApprovedReaction(signup, message, user, settings),
      )
      .with(SIGNUP_REVIEW_REACTIONS.DECLINED, () =>
        this.handleDeclinedReaction(signup, message, user),
      )
      .otherwise(() => {});
  }

  private async shouldHandleReaction(
    reaction: MessageReaction,
    user: User | PartialUser,
    settings: SettingsDocument,
  ) {
    if (!reaction.message.inGuild()) return false;

    const isAllowedUser = settings?.reviewerRole
      ? await this.discordService.userHasRole({
          userId: user.id,
          roleId: settings.reviewerRole,
          guildId: reaction.message.guildId,
        })
      : true;

    const isExpectedReactionType =
      reaction.emoji.name === SIGNUP_REVIEW_REACTIONS.APPROVED ||
      reaction.emoji.name === SIGNUP_REVIEW_REACTIONS.DECLINED;

    const isBotReacting = reaction.message.author?.id === user.id;

    return !isBotReacting && isAllowedUser && isExpectedReactionType;
  }

  // TODO: Refactor complexity
  private async handleApprovedReaction(
    signup: SignupDocument,
    sourceMessage: Message<true>,
    user: User,
    settings: SettingsDocument,
  ) {
    const {
      embeds: [sourceEmbed],
      guildId,
    } = sourceMessage;

    let embed = EmbedBuilder.from(sourceEmbed);

    const [displayName, progPoint] = await this.getDisplayNameAndProgPoint(
      user,
      guildId,
      signup,
      sourceEmbed,
    );

    const partyStatus = progPoint
      ? this.getPartyStatus(signup.encounter, progPoint)
      : undefined;

    const hasCleared = partyStatus === PartyStatus.Cleared;

    embed = this.updateProgPointField(embed, progPoint)
      .setFooter({
        text: `Approved by ${displayName}`,
        iconURL: user.displayAvatarURL(),
      })
      .setDescription(null)
      .setColor(Colors.Green)
      .setTimestamp(new Date());

    const confirmedSignup: SignupDocument = {
      ...signup,
      progPoint,
      partyStatus,
    };

    const [publicSignupChannel] = await Promise.all([
      settings.signupChannel
        ? this.discordService.getTextChannel({
            guildId,
            channelId: settings.signupChannel,
          })
        : undefined,
      settings.spreadsheetId &&
        this.sheetsService.upsertSignup(
          confirmedSignup,
          settings.spreadsheetId,
        ),
    ]);

    const messageContent = hasCleared
      ? `Congratulations on clearing **${
          EncounterFriendlyDescription[signup.encounter]
        }**!`
      : 'Signup Approved!';

    if (hasCleared) {
      embed = embed.setTitle('Congratulations!');
      await this.repository.removeSignup(signup);
    } else {
      await this.repository.updateSignupStatus(
        SignupStatus.APPROVED,
        confirmedSignup,
        user.username,
      );
    }

    const [, message] = await Promise.all([
      sourceMessage.edit({
        // preserve the original title on the message we are editing
        embeds: [EmbedBuilder.from(embed).setTitle(sourceEmbed.title)],
      }),
      publicSignupChannel?.send({
        content: `<@${confirmedSignup.discordId}> ${messageContent}`,
        embeds: [embed],
      }),
      this.assignProgRole({
        guildId: sourceMessage.guild.id,
        settings,
        signup,
        partyStatus,
      }),
    ]);

    if (hasCleared && message) {
      this.addReactions(message);
    }
  }

  private async handleDeclinedReaction(
    signup: SignupDocument,
    message: Message<true>,
    user: User,
  ) {
    const [displayName] = await Promise.all([
      this.discordService.getDisplayName({
        userId: user.id,
        guildId: message.guildId,
      }),
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

  private async handleError(
    error: unknown,
    user: User | PartialUser,
    message: Message | PartialMessage,
  ) {
    const scope = Sentry.getCurrentScope();
    scope.setExtras({ messageUrl: getMessageLink(message), message });

    this.logger.error(error);

    const reply = match(error)
      .with(
        P.instanceOf(DocumentNotFoundException),
        () => SIGNUP_MESSAGES.SIGNUP_NOT_FOUND_FOR_REACTION,
      )
      .otherwise(() => SIGNUP_MESSAGES.GENERIC_APPROVAL_ERROR);

    scope.captureMessage(reply, 'debug');

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

      await reply.update(SIGNUP_MESSAGES.UNEXPECTED_PROG_SELECTION_ERROR);
    } catch (error) {
      this.logger.error(error);

      await match(error)
        .with({ code: DiscordjsErrorCodes.InteractionCollectorError }, () =>
          message.edit({
            content: `:exclamation: **IMPORTANT**: ${SIGNUP_MESSAGES.PROG_SELECTION_TIMEOUT} :exclamation:`,
            components: [],
          }),
        )
        .otherwise(() => {
          // we don't care to report if the timeout error happened, thats normal
          // but anything else is unexpected and should be reported
          sentryReport(error, (scope) =>
            scope.setExtras({
              extra: {
                encounter: signup.encounter,
                discordId: signup.discordId,
              },
            }),
          );

          this.discordService.sendDirectMessage(
            user.id,
            SIGNUP_MESSAGES.UNEXPECTED_PROG_SELECTION_ERROR,
          );
        });
    }
  }

  private async assignProgRole({
    guildId,
    settings,
    signup: { encounter, discordId },
    partyStatus,
  }: {
    signup: Pick<SignupDocument, 'encounter' | 'discordId'>;
    settings: Pick<SettingsDocument, 'progRoles'>;
    guildId: string;
    partyStatus?: PartyStatus;
  }) {
    const role = settings.progRoles?.[encounter];
    const isValidpartyStatus =
      partyStatus === PartyStatus.EarlyProgParty ||
      partyStatus === PartyStatus.ProgParty;

    if (!(role && isValidpartyStatus)) {
      return;
    }

    try {
      const member = await this.discordService.getGuildMember({
        memberId: discordId,
        guildId,
      });

      if (member) {
        await member.roles.add(role);
      }
    } catch (e) {
      sentryReport(e, (scope) => scope.setExtras({ encounter, discordId }));
      this.logger.error(e);
    }
  }

  private async addReactions(message: Message) {
    const scope = Sentry.getCurrentScope();
    // fetch clear reactions and attach em to the embed
    try {
      const emojis = await this.discordService.getEmojis(ClearReactions);
      // add the emojis to the source embed
      await Promise.allSettled(
        emojis.map((emoji) =>
          message.react(emoji).catch((err) => {
            this.logger.warn(err);
            scope.captureException(err);
          }),
        ),
      );
    } catch (err) {
      this.logger.error(err);
      scope.captureException(err);
    }
  }

  private updateProgPointField(embed: EmbedBuilder, progPoint?: string) {
    if (!progPoint) {
      return embed;
    }

    const progPointFieldName = 'Prog Point';
    const progPointFieldIndex =
      embed.data.fields?.findIndex(
        (field) => field.name === progPointFieldName,
      ) ?? -1;

    if (progPointFieldIndex !== -1 && progPoint) {
      return embed.spliceFields(progPointFieldIndex, 1, {
        name: progPointFieldName,
        value: progPoint,
        inline: true,
      });
    }

    return embed;
  }

  private getPartyStatus(encounter: Encounter, progPoint: string) {
    return progPoint === PartyStatus.Cleared
      ? PartyStatus.Cleared
      : EncounterProgPoints[encounter][progPoint]?.partyStatus;
  }

  private getDisplayNameAndProgPoint(
    user: User,
    guildId: string,
    signup: SignupDocument,
    embed: Embed,
  ) {
    return Promise.all([
      this.discordService.getDisplayName({ userId: user.id, guildId }),
      this.requestProgPointConfirmation(signup, embed, user),
    ]);
  }
}

export { SignupService };
