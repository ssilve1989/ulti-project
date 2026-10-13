import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { type AutocompleteInteraction, SlashCommandBuilder } from 'discord.js';
import { test as base, describe, expect, vi } from 'vitest';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { ErrorModule } from '../error/error.module.js';
import { DiscordMock } from '../test-utils/discord/discord-mock.js';
import { fresh } from '../test-utils/fixtures.js';
import { watchSentryEvents } from '../test-utils/sentry.js';
import { SlashCommand } from './slash-command.decorator.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';
import { SlashCommandsService } from './slash-commands.service.js';

const withAutocomplete = (name: string) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(name)
    .addStringOption((option) =>
      option
        .setName('event')
        .setDescription('Event')
        .setRequired(true)
        .setAutocomplete(true),
    );

const AUTOCOMPLETE_FAILURE = new Error('autocomplete failed');

/** Suggests what has been typed, upper-cased. */
@SlashCommand({ builder: withAutocomplete('suggest') })
class SuggestingCommand {
  execute() {
    return Promise.resolve();
  }

  autocomplete(interaction: AutocompleteInteraction<'cached'>) {
    const typed = interaction.options.getFocused();
    return interaction.respond([{ name: typed.toUpperCase(), value: typed }]);
  }
}

@SlashCommand({ builder: withAutocomplete('plain') })
class CommandWithoutAutocomplete {
  execute() {
    return Promise.resolve();
  }
}

@SlashCommand({ builder: withAutocomplete('broken') })
class FailingAutocompleteCommand {
  execute() {
    return Promise.resolve();
  }

  autocomplete() {
    return Promise.reject(AUTOCOMPLETE_FAILURE);
  }
}

/** The app's real command listener and registry, over the fake Discord. */
async function createBot() {
  const discord = new DiscordMock();
  discord.addChannel('g1', 'c1');
  discord.addMember({ id: 'u1', username: 'one' });
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule, ErrorModule],
    providers: [
      SlashCommandRegistry,
      SlashCommandsService,
      SuggestingCommand,
      CommandWithoutAutocomplete,
      FailingAutocompleteCommand,
      { provide: DISCORD_CLIENT, useValue: discord.client },
    ],
  }).compile();
  await moduleRef.init();
  moduleRef.get(SlashCommandsService).listenToCommands();
  discord.registerCommands(
    moduleRef.get(SlashCommandRegistry).getAllBuilders(),
  );
  return { discord, close: () => moduleRef.close() };
}

const it = base.extend<{ bot: Awaited<ReturnType<typeof createBot>> }>({
  bot: fresh(createBot, (bot) => bot.close()),
});

const typeInto = (discord: DiscordMock, commandName: string, value: string) =>
  discord.autocomplete({
    userId: 'u1',
    guildId: 'g1',
    commandName,
    focused: 'event',
    value,
  });

describe('when a user types into an autocomplete option', () => {
  it('responds with the choices of the command handler', async ({ bot }) => {
    expect(await typeInto(bot.discord, 'suggest', 'dsr')).toEqual([
      { name: 'DSR', value: 'dsr' },
    ]);
  });

  describe('of a command whose handler has no autocomplete', () => {
    it('responds with no choices', async ({ bot }) => {
      expect(await typeInto(bot.discord, 'plain', 'dsr')).toEqual([]);
    });
  });

  describe('and the handler fails', () => {
    it('reports the error to Sentry', async ({ bot }) => {
      const reported: unknown[] = [];
      const stop = watchSentryEvents((_event, hint) =>
        reported.push(hint?.originalException),
      );
      try {
        // the failed handler never responds, so the choices never arrive
        void typeInto(bot.discord, 'broken', 'dsr');

        await vi.waitFor(() =>
          expect(reported).toEqual([AUTOCOMPLETE_FAILURE]),
        );
      } finally {
        stop();
      }
    });
  });
});
