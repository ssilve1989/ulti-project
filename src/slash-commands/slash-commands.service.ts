import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import {
  ChatInputCommandInteraction,
  Client,
  Events,
  REST,
  Routes,
} from 'discord.js';
import {
  catchError,
  defer,
  EMPTY,
  forkJoin,
  lastValueFrom,
  Observable,
  retry,
  timer,
} from 'rxjs';
import type { AppConfig } from '../app.config.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { safeReply } from '../discord/discord.helpers.js';
import { ErrorService } from '../error/error.service.js';
import { sentryReport } from '../sentry/sentry.consts.js';
import {
  SLASH_COMMANDS_TOKEN,
  type SlashCommands,
} from './slash-commands.provider.js';
import { getCommandForInteraction } from './slash-commands.utils.js';

@Injectable()
class SlashCommandsService {
  private readonly logger = new Logger(SlashCommandsService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(SLASH_COMMANDS_TOKEN) private readonly slashCommands: SlashCommands,
    private readonly errorService: ErrorService,
  ) {}

  listenToCommands() {
    this.client.on(Events.InteractionCreate, (interaction) => {
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

              scope.setTag('command', interaction.commandName);
              scope.setTag('guild_id', interaction.guildId);

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

  async registerCommands(): Promise<void> {
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
  ): Observable<void> {
    return defer(async () => {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: this.slashCommands,
      });

      this.logger.log(
        `Successfully registered ${this.slashCommands.length} application commands for guild: ${guildId}`,
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
  ): Promise<void> {
    const errorEmbed = this.errorService.handleCommandError(err, interaction);

    try {
      await safeReply(interaction, { embeds: [errorEmbed] });
    } catch (replyError) {
      this.logger.error(
        {
          originalError: err,
          replyError,
        },
        'Failed to send error response',
      );
    }
  }
}

export { SlashCommandsService };
