import { isDeepStrictEqual } from 'node:util';
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
import {
  PostedEventsUpdater,
  postedEventsSummary,
} from '../../../events/schedules/posted-events.updater.js';
import { readScheduleChanges } from '../../../events/schedules/schedule-options.js';
import { savedScheduleSummary } from '../../../events/schedules/schedule-panel.renderer.js';
import { SchedulePanelSession } from '../../../events/schedules/schedule-panel.session.js';
import { EventSchedulesCollection } from '../../../firebase/collections/event-schedules.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import type { ScheduleSettings } from '../../../firebase/models/event-schedule.model.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const SETTINGS_KEYS = [
  'title',
  'encounters',
  'channelId',
  'weekdays',
  'startTime',
  'timeZone',
  'postLeadHours',
  'signupsCloseBeforeHours',
] as const satisfies readonly (keyof ScheduleSettings)[];

/**
 * The settings in `after` that differ from `before`, and only those: the
 * update rewrites the whole document, so an `undefined` here would drop a field.
 */
function changedSettings(
  before: ScheduleSettings,
  after: ScheduleSettings,
): Partial<ScheduleSettings> {
  const changes: Partial<ScheduleSettings> = {};
  const compare = <K extends keyof ScheduleSettings>(key: K) => {
    if (!isDeepStrictEqual(before[key], after[key])) changes[key] = after[key];
  };
  for (const key of SETTINGS_KEYS) compare(key);
  return changes;
}

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'schedule-edit' })
class ScheduleEditCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly schedulesCollection: EventSchedulesCollection,
    private readonly panel: SchedulePanelSession,
    private readonly postedEvents: PostedEventsUpdater,
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

    const changes = readScheduleChanges(interaction, schedule);
    if (!changes.ok) {
      await interaction.editReply(changes.message);
      return;
    }

    const current: ScheduleSettings = {
      title: schedule.title,
      encounters: schedule.encounters,
      channelId: schedule.channelId,
      weekdays: schedule.weekdays,
      startTime: schedule.startTime,
      timeZone: schedule.timeZone,
      postLeadHours: schedule.postLeadHours,
      signupsCloseBeforeHours: schedule.signupsCloseBeforeHours,
    };
    const draft = await this.panel.open(
      interaction,
      { ...current, ...changes.values },
      'edit',
    );
    if (!draft) return;

    const saved = await this.postedEvents.apply(
      schedule.id,
      changedSettings(current, draft),
      interaction.user.id,
      new Date(),
    );
    const content = saved
      ? [savedScheduleSummary(saved.schedule), postedEventsSummary(saved)]
          .filter((line) => line !== undefined)
          .join('\n')
      : SCHEDULE_MISSING;
    await interaction.editReply({ content, embeds: [], components: [] });
  }

  autocomplete(interaction: AutocompleteInteraction<'cached'>): Promise<void> {
    return autocompleteSchedules(this.schedulesCollection, interaction);
  }
}

export { ScheduleEditCommandHandler };
