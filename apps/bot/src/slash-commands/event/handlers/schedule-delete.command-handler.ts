import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import {
  isOrganizer,
  notOrganizerMessage,
} from '../../../events/organizers.js';
import {
  autocompleteSchedules,
  pickedSchedule,
  SCHEDULE_MISSING,
} from '../../../events/schedules/picked-schedule.js';
import { EventSchedulesCollection } from '../../../firebase/collections/event-schedules.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'schedule-delete' })
class ScheduleDeleteCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly schedulesCollection: EventSchedulesCollection,
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

    const schedule = await pickedSchedule(
      this.schedulesCollection,
      interaction,
    );
    if (!schedule || !(await this.schedulesCollection.delete(schedule.id))) {
      await interaction.editReply(SCHEDULE_MISSING);
      return;
    }
    await interaction.editReply(
      `Deleted **${schedule.title}**. Events it already posted stay.`,
    );
  }

  autocomplete(interaction: AutocompleteInteraction<'cached'>): Promise<void> {
    return autocompleteSchedules(this.schedulesCollection, interaction);
  }
}

export { ScheduleDeleteCommandHandler };
