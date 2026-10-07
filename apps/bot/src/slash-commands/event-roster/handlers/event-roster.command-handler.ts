import { Injectable } from '@nestjs/common';
import {
  EncounterFriendlyDescription,
  isEncounter,
} from '@ulti-project/shared';
import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { appConfig } from '../../../config/app.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { rosterMessages } from '../event-roster.embeds.js';
import { EventRosterService } from '../event-roster.service.js';
import { createEventRosterSlashCommand } from '../event-roster.slash-command.js';

/** Raid-helper event IDs are the Discord message IDs of the events */
const EVENT_ID = /^\d+$/;

@Injectable()
@SlashCommand({
  builder: createEventRosterSlashCommand(appConfig.APPLICATION_MODE),
})
class EventRosterCommandHandler implements ISlashCommand {
  constructor(private readonly service: EventRosterService) {}

  async execute(interaction: ChatInputCommandInteraction<'cached'>) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = interaction.options.getString('event', true).trim();
    const encounter = interaction.options.getString('encounter', true);
    const format =
      interaction.options.getString('format') === 'list' ? 'list' : 'table';
    // the option only offers encounters, so this narrows the type
    if (!isEncounter(encounter)) {
      throw new Error(`Unknown encounter: ${encounter}`);
    }

    if (!EVENT_ID.test(eventId)) {
      await interaction.editReply(
        "That isn't a raid-helper event ID. Use the event's ID or its Discord message ID, which is all digits.",
      );
      return;
    }

    const roster = await this.service.getRoster(eventId, encounter);

    switch (roster.kind) {
      case 'not-found':
        await interaction.editReply(
          `Couldn't find a raid-helper event with ID \`${eventId}\`.`,
        );
        return;
      case 'empty':
        await interaction.editReply('This event has no sign-ups.');
        return;
      case 'roster': {
        const [first, ...rest] = rosterMessages({
          title: roster.title,
          description: EncounterFriendlyDescription[encounter],
          groups: roster.groups,
          format,
        });
        await interaction.editReply(first);
        for (const message of rest) {
          await interaction.followUp({
            ...message,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  }
}

export { EventRosterCommandHandler };
