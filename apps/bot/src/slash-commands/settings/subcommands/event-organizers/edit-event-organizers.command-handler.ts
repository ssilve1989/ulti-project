import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags, roleMention } from 'discord.js';
import { ComponentSessionService } from '../../../../discord/component-session.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import {
  createEventOrganizersSelectRow,
  EVENT_ORGANIZERS_SELECT_ID,
} from './event-organizers.components.js';

const INSTRUCTIONS =
  'Select the roles that can create and manage events. Your selection replaces the current list; submit an empty selection to remove every organizer role.';

@Injectable()
@SlashCommand({
  builder: SettingsSlashCommand,
  subcommand: 'event-organizers',
})
class EditEventOrganizersCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly componentSessions: ComponentSessionService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const replyMessage = await interaction.editReply({
      content: INSTRUCTIONS,
      components: [
        createEventOrganizersSelectRow(settings?.eventOrganizerRoles ?? []),
      ],
    });

    this.componentSessions.run(interaction, replyMessage, {
      name: 'settings event-organizers',
      expiredContent:
        'This menu has expired. Run /settings event-organizers again if needed.',
      onCollect: async (i) => {
        if (
          i.customId !== EVENT_ORGANIZERS_SELECT_ID ||
          !i.isRoleSelectMenu()
        ) {
          return;
        }

        await i.deferUpdate();

        const eventOrganizerRoles = i.values;

        await this.settingsCollection.upsert(interaction.guildId, {
          eventOrganizerRoles,
        });

        const confirmation =
          eventOrganizerRoles.length > 0
            ? `Saved! Event organizers: ${eventOrganizerRoles
                .map(roleMention)
                .join(', ')}`
            : 'Saved! Nobody can create events until organizer roles are set.';

        await i.editReply({
          content: `${INSTRUCTIONS}\n\n${confirmation}`,
          components: [createEventOrganizersSelectRow(eventOrganizerRoles)],
        });
      },
    });
  }
}

export { EditEventOrganizersCommandHandler };
