import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ChatInputCommandInteraction,
  CommandInteractionOptionResolver,
  MessageFlags,
} from 'discord.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditSettingsCommand } from './edit-settings.command.js';

@CommandHandler(EditSettingsCommand)
class EditSettingsCommandHandler
  implements ICommandHandler<EditSettingsCommand>
{
  private readonly logger = new Logger(EditSettingsCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditSettingsCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;

    try {
      const {
        modChannelId,
        reviewChannel,
        reviewerRole,
        signupChannel,
        ...rest
      } = this.getInteractionOptions(interaction.options);

      await this.settingsCollection.upsert(guildId, {
        modChannelId: modChannelId?.id,
        reviewChannel: reviewChannel?.id,
        reviewerRole: reviewerRole?.id,
        signupChannel: signupChannel?.id,
        ...rest,
      });

      await interaction.editReply('Settings updated!');
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private handleError(e: unknown, interaction: ChatInputCommandInteraction) {
    sentryReport(e);
    this.logger.error(e);
    return interaction.editReply('Something went wrong!');
  }

  private getInteractionOptions(
    options: Omit<
      CommandInteractionOptionResolver<'cached' | 'raw'>,
      'getMessage' | 'getFocused'
    >,
  ) {
    const reviewerRole = options.getRole('reviewer-role');
    const reviewChannel = options.getChannel('signup-review-channel');
    const signupChannel = options.getChannel('signup-public-channel');
    const spreadsheetId = options.getString('spreadsheet-id') ?? undefined;
    const modChannelId = options.getChannel('moderation-channel');

    const turboProgActive =
      options.getBoolean('turbo-prog-active') ?? undefined;
    const turboProgSpreadsheetId =
      options.getString('turbo-prog-spreadsheet-id') ?? undefined;

    const progRoles: Record<string, string | undefined> = {};
    const clearRoles: Record<string, string | undefined> = {};

    for (const encounter in Encounter) {
      const role = options.getRole(`${encounter.toLowerCase()}-prog-role`);
      const clearRole = options.getRole(
        `${encounter.toLowerCase()}-clear-role`,
      );

      if (role) {
        progRoles[encounter] = role.id;
      }

      if (clearRole) {
        clearRoles[encounter] = clearRole.id;
      }
    }

    return {
      clearRoles,
      modChannelId,
      progRoles,
      reviewChannel,
      reviewerRole,
      signupChannel,
      spreadsheetId,
      turboProgActive,
      turboProgSpreadsheetId,
    };
  }
}

export { EditSettingsCommandHandler };
