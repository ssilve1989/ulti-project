import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  type APIUser,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
  User,
} from 'discord.js';
import { match, P } from 'ts-pattern';
import {
  characterField,
  encounterField,
  worldField,
} from '../../../../common/components/fields.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../../../../firebase/firebase.exceptions.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { shouldDeleteReviewMessageForSignup } from '../../signup.utils.js';
import { RemoveSignupCommand } from './remove-signup.command.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_NO_DB_ENTRY,
  REMOVAL_NO_SHEET_ENTRY,
  REMOVAL_SUCCESS,
} from './remove-signup.consts.js';
import { RemoveSignupEvent } from './remove-signup.events.js';
import {
  type RemoveSignupSchema,
  removeSignupSchema,
} from './remove-signup.schema.js';

type RemoveSignupProps = {
  dto: RemoveSignupSchema;
  signup: SignupDocument;
  guildId: string;
  spreadsheetId?: string;
};

@CommandHandler(RemoveSignupCommand)
class RemoveSignupCommandHandler
  implements ICommandHandler<RemoveSignupCommand>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly signupsRepository: SignupCollection,
    private readonly eventBus: EventBus,
  ) {}

  @SentryTraced()
  async execute({ interaction }: RemoveSignupCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const scope = Sentry.getCurrentScope();
    const options = this.getOptions(interaction);

    scope.setExtra('options', options);

    const embed = new EmbedBuilder()
      .setTitle('Remove Signup')
      .setColor(Colors.Green)
      .addFields([
        encounterField(options.encounter),
        characterField(options.character),
        worldField(options.world),
      ]);

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply({
        embeds: [
          embed
            .setColor(Colors.Red)
            .setDescription(SIGNUP_MESSAGES.MISSING_SETTINGS),
        ],
      });
    }

    const { spreadsheetId, reviewerRole } = settings;

    try {
      const { canModify, signup } = await this.canModifySignup(
        interaction.user,
        options,
        interaction.guildId,
        reviewerRole,
      );

      if (!canModify) {
        return interaction.editReply({
          embeds: [
            embed
              .setDescription(REMOVAL_MISSING_PERMISSIONS)
              .setColor(Colors.Red),
          ],
        });
      }

      const description = await this.removeSignup({
        dto: options,
        signup,
        guildId: interaction.guildId,
        spreadsheetId,
      });

      await interaction.editReply({
        embeds: [embed.setDescription(description)],
      });
    } catch (error) {
      match(error)
        .with(P.instanceOf(DocumentNotFoundException), () =>
          this.handleDocumentNotFoundException(interaction, embed),
        )
        .otherwise(() => {
          throw error;
        });
    } finally {
      this.eventBus.publish(
        new RemoveSignupEvent(options, {
          guildId: interaction.guildId,
          discordId: interaction.user.id,
        }),
      );
    }
  }

  private async removeSignup({
    dto,
    guildId,
    spreadsheetId,
    signup,
  }: RemoveSignupProps): Promise<string> {
    const scope = Sentry.getCurrentScope();
    let description = REMOVAL_SUCCESS;
    // If the signup exists and has been approved, we expect to find it on the sheet
    const validStatus =
      signup.status === SignupStatus.APPROVED ||
      signup.status === SignupStatus.UPDATE_PENDING;

    if (spreadsheetId && validStatus) {
      const response = await this.sheetsService.removeSignup(
        dto,
        spreadsheetId,
      );

      // but if nothing was found on the sheet just let them know nothing was found
      if (response === 0) {
        description = REMOVAL_NO_SHEET_ENTRY;
      }
    }

    // if there is an existing signup check if the approval was already handled
    // if it has not been, remove it.
    if (shouldDeleteReviewMessageForSignup(signup)) {
      try {
        const reviewChannelId =
          await this.settingsCollection.getReviewChannel(guildId);

        if (reviewChannelId && signup.reviewMessageId) {
          await this.discordService.deleteMessage(
            guildId,
            reviewChannelId,
            signup.reviewMessageId,
          );
        }
      } catch (e) {
        scope.setExtra('signup', signup);
        scope.captureException(e);
      }
    }

    await this.signupsRepository.removeSignup(dto);
    return description;
  }

  private getOptions({ options }: ChatInputCommandInteraction) {
    return removeSignupSchema.parse({
      character: options.getString('character', true),
      world: options.getString('world', true),
      encounter: options.getString('encounter', true),
    });
  }

  private async canModifySignup(
    user: User | APIUser,
    { character, encounter, world }: RemoveSignupSchema,
    guildId: string,
    reviewerRole = '',
  ) {
    const hasRole = await this.discordService.userHasRole({
      userId: user.id,
      roleId: reviewerRole,
      guildId,
    });

    const signup = await this.signupsRepository.findOneOrFail({
      character,
      encounter,
      world,
    });
    return { canModify: hasRole || signup.discordId === user.id, signup };
  }

  private async handleDocumentNotFoundException(
    interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    embed: EmbedBuilder,
  ) {
    await interaction.editReply({
      embeds: [embed.setColor(Colors.Red).setDescription(REMOVAL_NO_DB_ENTRY)],
    });
  }
}

export { RemoveSignupCommandHandler };
