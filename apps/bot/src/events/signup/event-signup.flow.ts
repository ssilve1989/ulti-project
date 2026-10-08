import { Injectable } from '@nestjs/common';
import { type ButtonInteraction, MessageFlags } from 'discord.js';

/** A member's click on an event's Sign up button. */
@Injectable()
export class EventSignupFlow {
  async start(
    interaction: ButtonInteraction<'cached'>,
    _eventId: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply('Not available yet.');
  }
}
