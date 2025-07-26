import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { AppConfig } from '../app.config.js';
import { DiscordModule } from '../discord/discord.module.js';
import { ErrorModule } from '../error/error.module.js';
import { BlacklistModule } from './blacklist/blacklist.module.js';
import { CleanRolesModule } from './clean-roles/clean-roles.module.js';
import { EncountersSlashCommandModule } from './encounters/encounters.module.js';
import { HelpModule } from './help/help.module.js';
import { LookupModule } from './lookup/lookup.module.js';
import { RemoveRoleModule } from './remove-role/remove-role.module.js';
import { RetireModule } from './retire/retire.module.js';
import { SearchModule } from './search/search.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SlashCommandsSharedModule } from './shared/slash-commands-shared.module.js';
import { SignupModule } from './signup/signup.module.js';
import { SlashCommandsService } from './slash-commands.service.js';
import { StatusModule } from './status/status.module.js';
import { TurboProgModule } from './turboprog/turbo-prog.module.js';

@Module({
  imports: [
    DiscordModule,
    ErrorModule,
    ConfigModule,
    CqrsModule,
    SlashCommandsSharedModule,
    BlacklistModule,
    CleanRolesModule,
    EncountersSlashCommandModule,
    HelpModule,
    LookupModule,
    RemoveRoleModule,
    RetireModule,
    SearchModule,
    SettingsModule,
    SignupModule,
    StatusModule,
    TurboProgModule,
  ],
  providers: [SlashCommandsService],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly service: SlashCommandsService,
  ) {}

  onApplicationBootstrap() {
    this.service.listenToCommands();
    if (this.configService.get('DISCORD_REFRESH_COMMANDS')) {
      // If we await here, the logs will be buffered since it's blocking application bootstrap
      this.service.registerCommands();
    }
  }
}
