import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import {
  ChatInputCommandInteraction,
  Client,
  Events,
  REST,
  Routes,
} from 'discord.js';
import { EMPTY, catchError, defer, forkJoin, lastValueFrom, retry } from 'rxjs';
import { match } from 'ts-pattern';
import { AppConfig } from '../app.config.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { sentryReport } from '../sentry/sentry.consts.js';
import { LookupCommand } from './lookup/lookup.command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { SettingsSlashCommand } from './settings/settings-slash-command.js';
import { EditSettingsCommand } from './settings/subcommands/edit-settings.command.js';
import { ViewSettingsCommand } from './settings/subcommands/view-settings.command.js';
import { SignupSlashCommand } from './signup/signup-slash-command.js';
import { SignupCommand } from './signup/signup.commands.js';
import { RemoveSignupSlashCommand } from './signup/subcommands/remove-signup/remove-signup-slash-command.js';
import { RemoveSignupCommand } from './signup/subcommands/remove-signup/remove-signup.command.js';
import { SLASH_COMMANDS } from './slash-commands.js';
import { StatusSlashCommand } from './status/status-slash-command.js';
import { StatusCommand } from './status/status.command.js';
import { TurboProgCommand } from './turboprog/turbo-prog.command.js';
import { TurboProgSlashCommand } from './turboprog/turbo-prog.slash-command.js';

@Injectable()
class SlashCommandsService {
  private readonly logger = new Logger(SlashCommandsService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  listenToCommands() {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await Sentry.withScope(async (scope) => {
        if (!(interaction.isChatInputCommand() && interaction.inGuild())) {
          return;
        }

        scope.setUser({
          userId: interaction.user.id,
          username: interaction.user.username,
        });
        scope.setExtras({
          command: interaction.commandName,
        });

        // TODO: This could be more generic somehow
        const command = match(interaction.commandName)
          .with(LookupSlashCommand.name, () => new LookupCommand(interaction))
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
          .with(
            TurboProgSlashCommand.name,
            () => new TurboProgCommand(interaction),
          )
          .otherwise(() => undefined);

        if (command) {
          try {
            await this.commandBus.execute(command);
          } catch (err) {
            await this.handleCommandError(err, interaction);
          }
        }
      });
    });
  }

  async registerCommands() {
    this.logger.log('refreshing slash commands');

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
        sentryReport(err);
        this.logger.error(err);
        return EMPTY;
      }),
    );
  }

  private async handleCommandError(
    err: unknown,
    interaction: ChatInputCommandInteraction,
  ) {
    sentryReport(err);
    this.logger.error(err);

    try {
      await interaction.followUp(
        'An unexpected error occurred while processing your command. Please try again later',
      );
    } catch (e) {
      sentryReport(e);
      this.logger.error(e);
    }
  }
}

export { SlashCommandsService };
