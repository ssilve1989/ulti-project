---
to: src/slash-commands/<%=name%>/<%=name%>.command-handler.ts
---
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { ErrorService } from '../../error/error.service.js';
import { <%= h.changeCase.pascal(name) %>Command } from './<%=name%>.command.js';

@CommandHandler(<%= h.changeCase.pascal(name) %>Command)
class <%= h.changeCase.pascal(name) %>CommandHandler implements ICommandHandler<<%= h.changeCase.pascal(name) %>Command> {
  constructor(
    @Inject(ErrorService)
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(command: <%= h.changeCase.pascal(name) %>Command): Promise<void> {
    const { interaction } = command;

    try {
      // TODO: Implement command logic
      await interaction.reply({
        content: 'Command not implemented yet',
        ephemeral: true,
      });
    } catch (error) {
      Sentry.getCurrentScope().captureException(error);
      await this.errorService.handleError({
        interaction,
        error: error as Error,
      });
    }
  }
}

export { <%= h.changeCase.pascal(name) %>CommandHandler };
