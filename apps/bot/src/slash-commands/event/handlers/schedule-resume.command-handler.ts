import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  TimestampStyles,
  time,
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
@SlashCommand({ builder: EventSlashCommand, subcommand: 'schedule-resume' })
class ScheduleResumeCommandHandler implements ISlashCommand {
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
    if (!schedule) {
      await interaction.editReply(SCHEDULE_MISSING);
      return;
    }
    // Resuming recomputes the times from now, which would skip a running
    // schedule's due occurrence that hasn't been posted yet
    if (!schedule.paused) {
      await interaction.editReply(`**${schedule.title}** isn't paused.`);
      return;
    }

    const resumed = await this.schedulesCollection.setPaused(
      schedule.id,
      false,
      new Date(),
    );
    await interaction.editReply(
      resumed
        ? `Resumed **${resumed.title}**. Next event ${time(resumed.nextStartAt.toDate(), TimestampStyles.FullDateShortTime)}.`
        : SCHEDULE_MISSING,
    );
  }

  autocomplete(interaction: AutocompleteInteraction<'cached'>): Promise<void> {
    return autocompleteSchedules(this.schedulesCollection, interaction);
  }
}

export { ScheduleResumeCommandHandler };
