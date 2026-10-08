import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { roleMention } from 'discord.js';
import { ComponentSessionService } from '../../../../discord/component-session.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { runRoleSelectSetting } from '../role-select-setting.js';

export const BOARD_ACCESS_SELECT_ID = 'boardAccessSelect';

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
    const { settingsCollection, componentSessions } = this;
    await runRoleSelectSetting(
      interaction,
      { settingsCollection, componentSessions },
      {
        field: 'boardViewerRoles',
        instructions:
          'Select the roles that can view the coordinator board. Squad roles can always view it.',
        select: {
          customId: BOARD_ACCESS_SELECT_ID,
          placeholder: 'Select board viewer roles',
        },
        saved: (roleIds) =>
          `Saved! Board viewers: ${roleIds.map(roleMention).join(', ')}`,
        emptySaved: 'Saved! Only squad roles can view the board.',
        expiredContent:
          'This menu has expired. Run /settings board-access again if needed.',
        sessionName: 'settings board-access',
      },
    );
  }
}

export { EditBoardAccessCommandHandler };
