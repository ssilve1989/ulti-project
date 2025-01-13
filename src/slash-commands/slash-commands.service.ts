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
import {
  EMPTY,
  catchError,
  defer,
  forkJoin,
  lastValueFrom,
  retry,
  timer,
} from 'rxjs';
import type { AppConfig, ApplicationModeConfig } from '../app.config.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { sentryReport } from '../sentry/sentry.consts.js';
import { BlacklistSlashCommand } from './blacklist/blacklist.slash-command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { RemoveRoleSlashCommand } from './remove-role/remove-role.slash-command.js';
import { SettingsSlashCommand } from './settings/settings.slash-command.js';
import { createSignupSlashCommand } from './signup/signup.slash-command.js';
import { createRemoveSignupSlashCommand } from './signup/subcommands/remove-signup/remove-signup.slash-command.js';
import { getCommandForInteraction } from './slash-commands.utils.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { createTurboProgSlashCommand } from './turboprog/turbo-prog-signup.slash-command.js';

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
      if (!(interaction.isChatInputCommand() && interaction.inGuild())) {
        return;
      }

      return Sentry.startNewTrace(() => {
        return Sentry.startSpanManual(
          { name: interaction.commandName, op: 'command' },
          (span) => {
            return Sentry.withScope(async (scope) => {
              scope.setUser({
                userId: interaction.user.id,
                username: interaction.user.username,
              });

              scope.setExtras({
                command: interaction.commandName,
              });

              Sentry.metrics.increment('command', 1, {
                tags: { commandName: interaction.commandName },
              });

              const command = getCommandForInteraction(interaction);

              if (command) {
                try {
                  await this.commandBus.execute(command);
                  span.setStatus({ code: 1 });
                } catch (err) {
                  await this.handleCommandError(err, interaction);
                  span.setStatus({ code: 2 });
                } finally {
                  span.end();
                }
              }
            });
          },
        );
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
    const applicationModeConfig =
      this.configService.get<ApplicationModeConfig>('APPLICATION_MODE');

    const slashCommands = [
      BlacklistSlashCommand,
      createRemoveSignupSlashCommand(applicationModeConfig),
      createSignupSlashCommand(applicationModeConfig),
      createTurboProgSlashCommand(applicationModeConfig),
      LookupSlashCommand,
      RemoveRoleSlashCommand,
      SettingsSlashCommand,
      StatusSlashCommand,
    ];

    return defer(async () => {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: slashCommands,
      });

      this.logger.log(
        `Successfully registered ${slashCommands.length} application commands for guild: ${guildId}`,
      );
    }).pipe(
      retry({
        count: 5,
        delay: (err) => {
          this.logger.error(err);
          return timer(1000);
        },
      }),
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
