import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { USTimeZones } from '../../../common/time-zones.js';
import { EventMessageService } from '../../../events/event-message.service.js';
import {
  isOrganizer,
  notOrganizerMessage,
} from '../../../events/organizers.js';
import { EventsCollection } from '../../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const shortDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: USTimeZones.EASTERN,
});

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'close' })
class CloseEventCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly eventsCollection: EventsCollection,
    private readonly eventMessages: EventMessageService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    if (!isOrganizer(interaction.member, settings)) {
      await interaction.editReply(notOrganizerMessage(settings));
      return;
    }

    // Discord doesn't hold the option to the autocomplete choices, so only
    // close an id that is one of this guild's active events
    const id = interaction.options.getString('event', true);
    const active = await this.eventsCollection.findActive(interaction.guildId);
    const event = active.some((candidate) => candidate.id === id)
      ? await this.eventsCollection.close(id)
      : undefined;
    if (!event) {
      await interaction.editReply(
        "That event is already closed or doesn't exist.",
      );
      return;
    }

    await this.eventMessages.refresh(id);
    await interaction.editReply(`Closed **${event.title}**.`);
  }

  async autocomplete(
    interaction: AutocompleteInteraction<'cached'>,
  ): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase();
    const events = await this.eventsCollection.findActive(interaction.guildId);
    await interaction.respond(
      events
        .filter((event) => event.title.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((event) => ({
          name: `${event.title} · ${shortDate.format(event.startsAt.toDate())}`.slice(
            0,
            100,
          ),
          value: event.id,
        })),
    );
  }
}

export { CloseEventCommandHandler };
