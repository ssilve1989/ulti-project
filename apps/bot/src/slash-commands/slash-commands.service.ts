import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Client, Events, REST, Routes } from 'discord.js';
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
import { withUnitOfWork } from '../common/sentry.js';
import { appConfig } from '../config/app.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { ErrorService } from '../error/error.service.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';

@Injectable()
class SlashCommandsService {
  private readonly logger = new Logger(SlashCommandsService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly registry: SlashCommandRegistry,
    private readonly errorService: ErrorService,
  ) {}

  listenToCommands() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isAutocomplete() && interaction.inCachedGuild()) {
        void this.registry
          .dispatchAutocomplete(interaction)
          .catch((error: unknown) =>
            this.errorService.captureError(error, {
              message: `autocomplete for /${interaction.commandName} failed`,
            }),
          );
        return;
      }

      if (!(interaction.isChatInputCommand() && interaction.inCachedGuild())) {
        return;
      }

      return withUnitOfWork(() => {
        return Sentry.startSpanManual(
          { name: interaction.commandName, op: 'command' },
          (span) => {
            return Sentry.withScope(async (scope) => {
              scope.setUser({
                id: interaction.user.id,
                username: interaction.user.username,
              });

              scope.setTag('command', interaction.commandName);
              scope.setTag('guild_id', interaction.guildId);

              const subcommand = interaction.options.getSubcommand(false);

              // Sentry drops `undefined` attributes but stringifies `null` into
              // the literal "null", so coerce before handing them over.
              Sentry.metrics.count('discord.command.invoked', 1, {
                attributes: {
                  command: interaction.commandName,
                  subcommand: subcommand ?? undefined,
                },
              });

              try {
                this.logger.debug(
                  `dispatching command: ${interaction.commandName}`,
                );

                await this.registry.dispatch(interaction);
                span.setStatus({ code: 1 });
              } catch (err) {
                await this.errorService.replyWithError(err, interaction);
                span.setStatus({ code: 2 });
              } finally {
                span.end();
              }
            });
          },
        );
      });
    });
  }

  async registerCommands(): Promise<void> {
    this.logger.log('refreshing slash commands');

    const clientId = appConfig.CLIENT_ID;
    const guildIds = this.client.guilds.cache.map((guild) => guild.id);
    const rest = new REST().setToken(appConfig.DISCORD_TOKEN);

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
    const builders = this.registry.getAllBuilders();
    return defer(async () => {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: builders,
      });

      this.logger.log(
        `Successfully registered ${builders.length} application commands for guild: ${guildId}`,
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
        this.errorService.captureError(err);
        return EMPTY;
      }),
    );
  }
}

export { SlashCommandsService };
