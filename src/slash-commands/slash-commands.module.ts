import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { appConfig } from '../config/app.js';
import { DiscordModule } from '../discord/discord.module.js';
import { ErrorModule } from '../error/error.module.js';
import { RoleManagerModule } from '../role-manager/role-manager.module.js';
import { BlacklistModule } from './blacklist/blacklist.module.js';
import { CleanRolesModule } from './clean-roles/clean-roles.module.js';
import { EncountersSlashCommandModule } from './encounters/encounters.module.js';
import { HelpModule } from './help/help.module.js';
import { LookupModule } from './lookup/lookup.module.js';
import { RemoveRoleModule } from './remove-role/remove-role.module.js';
import { RemoveSignupModule } from './remove-signup/remove-signup.module.js';
import { RetireModule } from './retire/retire.module.js';
import { SearchModule } from './search/search.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SignupModule } from './signup/signup.module.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';
import { SlashCommandsService } from './slash-commands.service.js';
import { StatusModule } from './status/status.module.js';
import { TurboProgModule } from './turboprog/turbo-prog.module.js';

@Module({
  imports: [
    DiscordModule,
    DiscoveryModule,
    ErrorModule,
    RoleManagerModule,
    BlacklistModule,
    CleanRolesModule,
    EncountersSlashCommandModule,
    HelpModule,
    LookupModule,
    RemoveRoleModule,
    RemoveSignupModule,
    RetireModule,
    SearchModule,
    SettingsModule,
    SignupModule,
    StatusModule,
    TurboProgModule,
  ],
  providers: [SlashCommandsService, SlashCommandRegistry],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(private readonly service: SlashCommandsService) {}

  onApplicationBootstrap() {
    this.service.listenToCommands();
    if (appConfig.DISCORD_REFRESH_COMMANDS) {
      this.service.registerCommands();
    }
  }
}
