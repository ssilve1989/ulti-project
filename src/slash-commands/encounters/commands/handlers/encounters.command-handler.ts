import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  EncountersCommand,
  ManageProgPointsCommand,
  SetThresholdsCommand,
  ViewEncounterCommand,
} from '../encounters.commands.js';

@CommandHandler(EncountersCommand)
export class EncountersCommandHandler
  implements ICommandHandler<EncountersCommand>
{
  private readonly logger = new Logger(EncountersCommandHandler.name);

  constructor(private readonly commandBus: CommandBus) {}

  @SentryTraced()
  async execute({ interaction }: EncountersCommand): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'set-thresholds': {
          const encounterId = interaction.options.getString('encounter', true);
          await this.commandBus.execute(
            new SetThresholdsCommand(interaction, encounterId),
          );
          break;
        }

        case 'manage-prog-points': {
          const encounterId = interaction.options.getString('encounter', true);
          await this.commandBus.execute(
            new ManageProgPointsCommand(interaction, encounterId),
          );
          break;
        }

        case 'view': {
          const encounterId = interaction.options.getString('encounter');
          await this.commandBus.execute(
            new ViewEncounterCommand(interaction, encounterId || undefined),
          );
          break;
        }

        default:
          await interaction.reply({
            content: `❌ Unknown subcommand: ${subcommand}`,
            ephemeral: true,
          });
          break;
      }
    } catch (error) {
      this.logger.error(
        error,
        `Failed to handle encounters subcommand ${subcommand}`,
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            '❌ An error occurred while processing your request. Please try again.',
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content:
            '❌ An error occurred while processing your request. Please try again.',
        });
      }
    }
  }
}
