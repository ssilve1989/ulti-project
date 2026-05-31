---
to: src/slash-commands/<%=name%>/handlers/<%=name%>.command-handler.ts
---
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { ErrorService } from '../../../error/error.service.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { <%= h.changeCase.pascal(name) %>SlashCommand } from '../../<%=name%>.slash-command.js';

@Injectable()
@SlashCommand({ builder: <%= h.changeCase.pascal(name) %>SlashCommand })
class <%= h.changeCase.pascal(name) %>CommandHandler implements ISlashCommand {
  constructor(
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
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
