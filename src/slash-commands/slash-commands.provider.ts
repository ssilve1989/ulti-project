import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { AppConfig, ApplicationModeConfig } from '../app.config.js';
import { BlacklistSlashCommand } from './blacklist/blacklist.slash-command.js';
import { CleanRolesSlashCommand } from './clean-roles/clean-roles.slash-command.js';
import { EncountersSlashCommand } from './encounters/encounters.slash-command.js';
import { createFinalPushSlashCommand } from './finalpush/final-push-signup.slash-command.js';
import { HelpSlashCommand } from './help/help.slash-command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { RemoveRoleSlashCommand } from './remove-role/remove-role.slash-command.js';
import { createRemoveSignupSlashCommand } from './remove-signup/remove-signup.slash-command.js';
import { RetireSlashCommand } from './retire/retire.slash-command.js';
import { SearchSlashCommand } from './search/search.slash-command.js';
import { SettingsSlashCommand } from './settings/settings.slash-command.js';
import { createSignupSlashCommand } from './signup/signup.slash-command.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { createTurboProgSlashCommand } from './turboprog/turbo-prog-signup.slash-command.js';

export const SLASH_COMMANDS_TOKEN = Symbol('SLASH_COMMANDS');

export type SlashCommands = (
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | ReturnType<typeof createSignupSlashCommand>
)[];

export const SlashCommandsProvider: Provider<SlashCommands> = {
  provide: SLASH_COMMANDS_TOKEN,
  useFactory: (
    configService: ConfigService<AppConfig, true>,
  ): SlashCommands => {
    const applicationModeConfig =
      configService.get<ApplicationModeConfig>('APPLICATION_MODE');

    return [
      BlacklistSlashCommand,
      CleanRolesSlashCommand,
      EncountersSlashCommand,
      createRemoveSignupSlashCommand(applicationModeConfig),
      createSignupSlashCommand(applicationModeConfig),
      createTurboProgSlashCommand(applicationModeConfig),
      createFinalPushSlashCommand(applicationModeConfig),
      LookupSlashCommand,
      RemoveRoleSlashCommand,
      RetireSlashCommand,
      SearchSlashCommand,
      SettingsSlashCommand,
      StatusSlashCommand,
      HelpSlashCommand,
    ];
  },
  inject: [ConfigService],
};
