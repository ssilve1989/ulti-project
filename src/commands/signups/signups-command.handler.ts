import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Client,
  ComponentType,
  EmbedBuilder,
  MessageComponentInteraction,
} from 'discord.js';
import { InjectDiscordClient } from '../../client/client.decorators.js';
import { Rows } from './signup.consts.js';
import { SignupCommand } from './signups.command.js';

@CommandHandler(SignupCommand)
class SignupCommandHandler implements ICommandHandler<SignupCommand> {
  private readonly logger = new Logger(SignupCommandHandler.name);

  constructor(@InjectDiscordClient() private readonly client: Client) {}

  async execute({ interaction }: SignupCommand) {
    this.logger.log(
      `handling signup command for user: ${interaction.user.username}`,
    );

    const response = await interaction.reply({
      content: 'Select an encounter to sign up for',
      components: [Rows.EncounterSelector] as any[],
      ephemeral: true,
    });

    const encounterSelectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      interactionResponse: response,
    });

    const availability = await this.getAvailability(encounterSelectInteraction);

    const embed = this.createSummaryEmbed(
      encounterSelectInteraction.values[0],
      availability,
    );

    await this.client.users.send(interaction.user.id, { embeds: [embed] });
  }

  private async getAvailability(interaction: MessageComponentInteraction) {
    const availability: Record<string, any> = {};
    let done = false;
    let currentInteraction: MessageComponentInteraction = interaction;

    while (!done) {
      const dayOfWeekRequest = await currentInteraction.update({
        content: 'Select a day to sign up for',
        components: [Rows.DayOfWeek] as any[],
      });

      const dayOfWeekReply = await dayOfWeekRequest.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        interactionResponse: dayOfWeekRequest,
      });

      const startTimeRequest = await dayOfWeekReply.update({
        content: 'Select the earliest time available',
        components: [Rows.StartTime] as any[],
      });

      const startTimeReply = await startTimeRequest.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        interactionResponse: startTimeRequest,
      });

      const endTimeRequest = await startTimeReply.update({
        content: 'Select the latest time available',
        components: [Rows.EndTime] as any[],
      });

      const endTimeReply = await endTimeRequest.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        interactionResponse: endTimeRequest,
      });

      Object.assign(availability, {
        [dayOfWeekReply.values[0]]: {
          start: startTimeReply.values[0],
          end: endTimeReply.values[0],
        },
      });

      const confirmationRequest = await endTimeReply.update({
        components: [Rows.Confirmation] as any[],
        content: 'Add More Days?',
      });

      const confirmationReply = await confirmationRequest.awaitMessageComponent(
        {
          componentType: ComponentType.Button,
          interactionResponse: confirmationRequest,
        },
      );

      if (confirmationReply.customId === 'done') {
        done = true;
        confirmationReply.reply('Thanks for your submission!');
      } else {
        currentInteraction = confirmationReply;
      }
    }

    return availability;
  }

  private createSummaryEmbed(
    encounter: string,
    availability: Record<string, { start: string; end: string }>,
  ) {
    const embed = new EmbedBuilder()
      .setTitle(`${encounter} Signup`)
      .setDescription("Here's a summary of your selections")
      .addFields(
        Object.entries(availability).map(([day, { start, end }]) => ({
          name: day,
          value: `${start} - ${end}`,
        })),
      );

    return embed;
  }
}

export { SignupCommandHandler };
