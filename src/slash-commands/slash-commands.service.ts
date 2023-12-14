import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../app.config.js';
import { REST, Routes } from 'discord.js';
import { Logger } from '@nestjs/common';
import { SLASH_COMMANDS } from './slash-commands.js';

@Injectable()
class SlashCommandsService {
  private readonly logger = new Logger(SlashCommandsService.name);
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async registerCommands() {
    this.logger.log(`refreshing slash commands`);

    const clientId = this.configService.get<string>('CLIENT_ID');
    const guildId = this.configService.get<string>('GUILD_ID');
    const rest = new REST().setToken(
      this.configService.get<string>('DISCORD_TOKEN'),
    );

    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: SLASH_COMMANDS,
      });

      this.logger.log(
        `Successfully registered ${SLASH_COMMANDS.length} application commands.`,
      );
    } catch (e) {
      this.logger.error(e);
    }
  }
}

export { SlashCommandsService };
