import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscordModule } from '../discord/discord.module.js';
import { SlashCommandsService } from './slash-commands.service.js';
import { Client, Events } from 'discord.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { match } from 'ts-pattern';
import { SignupCommand } from '../signups/commands/signup.commands.js';
import { StatusCommand } from '../status/commands/status.command.js';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { StatusSlashCommand } from './status-slash-command.js';
import { SignupSlashCommand } from './signup-slash-command.js';
import { SettingsSlashCommand } from './settings-slash-command.js';
import { SettingsCommand } from '../settings/settings.command.js';

@Module({
  imports: [DiscordModule, ConfigModule, CqrsModule],
  providers: [SlashCommandsService],
})
export class SlashCommandsModule implements OnApplicationBootstrap {
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly service: SlashCommandsService,
    private readonly commandBus: CommandBus,
  ) {}

  async onApplicationBootstrap() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

      // TODO: This could be more generic somehow
      const command = match(interaction.commandName)
        .with(SignupSlashCommand.name, () => new SignupCommand(interaction))
        .with(StatusSlashCommand.name, () => new StatusCommand(interaction))
        .with(SettingsSlashCommand.name, () => new SettingsCommand(interaction))
        .run();

      this.commandBus.execute(command);
    });

    await this.service.registerCommands();
  }
}
