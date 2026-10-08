import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  channelMention,
  EmbedBuilder,
  MessageFlags,
  TimestampStyles,
  time,
} from 'discord.js';
import {
  isOrganizer,
  notOrganizerMessage,
} from '../../../events/organizers.js';
import { describeRecurrence } from '../../../events/schedules/schedule-panel.renderer.js';
import { EventSchedulesCollection } from '../../../firebase/collections/event-schedules.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import type { StoredSchedule } from '../../../firebase/models/event-schedule.model.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

/** Discord's limit on an embed's fields. */
const MAX_FIELDS = 25;

const byTitleThenId = (a: StoredSchedule, b: StoredSchedule) =>
  a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

function scheduleField(schedule: StoredSchedule) {
  const next = schedule.nextPostAt
    ? `Next: ${time(schedule.nextStartAt.toDate(), TimestampStyles.FullDateShortTime)}, posted ${time(schedule.nextPostAt.toDate(), TimestampStyles.RelativeTime)}`
    : 'Paused';
  return {
    name: schedule.title,
    value: [
      `${schedule.encounters.join(', ')} · ${channelMention(schedule.channelId)}`,
      describeRecurrence(schedule),
      next,
    ].join('\n'),
  };
}

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'schedule-list' })
class ScheduleListCommandHandler implements ISlashCommand {
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

    const schedules = await this.schedulesCollection.listForGuild(
      interaction.guildId,
    );
    if (schedules.length === 0) {
      await interaction.editReply(
        'No schedules yet. Create one with /event schedule-create.',
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Event schedules')
      .addFields(
        schedules
          .toSorted(byTitleThenId)
          .slice(0, MAX_FIELDS)
          .map(scheduleField),
      );
    if (schedules.length > MAX_FIELDS) {
      embed.setDescription(`…and ${schedules.length - MAX_FIELDS} more.`);
    }
    await interaction.editReply({ embeds: [embed] });
  }
}

export { ScheduleListCommandHandler };
