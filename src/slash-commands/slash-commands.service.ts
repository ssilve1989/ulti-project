import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Events, REST, Routes } from 'discord.js';
import { match } from 'ts-pattern';
import { AppConfig } from '../app.config.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { SignupCommand } from '../signups/commands/signup.commands.js';
import { StatusCommand } from '../status/commands/status.command.js';
import { SettingsSlashCommand } from './settings-slash-command.js';
import { SignupSlashCommand } from './signup-slash-command.js';
import { SLASH_COMMANDS } from './slash-commands.js';
import { StatusSlashCommand } from './status-slash-command.js';
import { CommandBus } from '@nestjs/cqrs';
import { EditSettingsCommand } from '../settings/commands/edit-settings.command.js';
import { ViewSettingsCommand } from '../settings/commands/view-settings.command.js';
import { RemoveSignupSlashCommand } from './remove-signup-slash-command.js';
import { RemoveSignupCommand } from '../signups/commands/remove-signup.command.js';
import { EMPTY, catchError, defer, forkJoin, lastValueFrom, retry } from 'rxjs';

@Injectable()
class SlashCommandsService {
  private readonly logger = new Logger(SlashCommandsService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  listenToCommands() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

      // TODO: This could be more generic somehow
      const command = match(interaction.commandName)
        .with(SignupSlashCommand.name, () => new SignupCommand(interaction))
        .with(StatusSlashCommand.name, () => new StatusCommand(interaction))
        .with(SettingsSlashCommand.name, () => {
          const subcommand = interaction.options.getSubcommand();
          return match(subcommand)
            .with('edit', () => new EditSettingsCommand(interaction))
            .with('view', () => new ViewSettingsCommand(interaction))
            .run();
        })
        .with(
          RemoveSignupSlashCommand.name,
          () => new RemoveSignupCommand(interaction),
        )
        .otherwise(() => undefined);

      if (command) {
        this.commandBus.execute(command);
      }
    });
  }

  async registerCommands() {
    this.logger.log(`refreshing slash commands`);

    const clientId = this.configService.get<string>('CLIENT_ID');
    const guildIds = this.client.guilds.cache.map((guild) => guild.id);

    const rest = new REST().setToken(
      this.configService.get<string>('DISCORD_TOKEN'),
    );

    await lastValueFrom(
      forkJoin(
        guildIds.map((guildId) =>
          this.registerCommandsForGuild(clientId, guildId, rest),
        ),
      ),
      { defaultValue: undefined },
    );
  }

  private registerCommandsForGuild(
    clientId: string,
    guildId: string,
    rest: REST,
  ) {
    return defer(async () => {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: SLASH_COMMANDS,
      });

      this.logger.log(
        `Successfully registered ${SLASH_COMMANDS.length} application commands for guild: ${guildId}`,
      );
    }).pipe(
      retry({ count: 10, delay: 1000 }),
      catchError((err) => {
        this.logger.error(err);
        return EMPTY;
      }),
    );
  }
}

export { SlashCommandsService };
