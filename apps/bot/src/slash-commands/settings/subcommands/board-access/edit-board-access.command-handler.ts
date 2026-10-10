import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  ActionRowBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  roleMention,
} from 'discord.js';
import { ComponentSessionService } from '../../../../discord/component-session.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

export const BOARD_ACCESS_SELECT_ID = 'boardAccessSelect';

const INSTRUCTIONS =
  'Select the roles that can view the coordinator board. Squad roles can always view it.';

function createBoardAccessSelectRow(roleIds: string[]) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(BOARD_ACCESS_SELECT_ID)
    .setPlaceholder('Select board viewer roles')
    .setMinValues(0)
    .setMaxValues(25)
    .setDefaultRoles(roleIds);

  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
}

@Injectable()
@SlashCommand({
  builder: SettingsSlashCommand,
  subcommand: 'board-access',
})
class EditBoardAccessCommandHandler implements ISlashCommand {
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
        createBoardAccessSelectRow(settings?.boardViewerRoles ?? []),
      ],
    });

    this.componentSessions.run(interaction, replyMessage, {
      name: 'settings board-access',
      expiredContent:
        'This menu has expired. Run /settings board-access again if needed.',
      onCollect: async (i) => {
        if (i.customId !== BOARD_ACCESS_SELECT_ID || !i.isRoleSelectMenu()) {
          return;
        }

        await i.deferUpdate();

        const boardViewerRoles = i.values;

        await this.settingsCollection.upsert(interaction.guildId, {
          boardViewerRoles,
        });

        const confirmation =
          boardViewerRoles.length > 0
            ? `Saved! Board viewers: ${boardViewerRoles.map(roleMention).join(', ')}`
            : 'Saved! Only squad roles can view the board.';

        await i.editReply({
          content: `${INSTRUCTIONS}\n\n${confirmation}`,
          components: [createBoardAccessSelectRow(boardViewerRoles)],
        });
      },
    });
  }
}

export { EditBoardAccessCommandHandler };
