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
import { scheduleChoices } from '../../../events/schedules/schedule-choices.js';
import { readScheduleChanges } from '../../../events/schedules/schedule-options.js';
import { savedScheduleSummary } from '../../../events/schedules/schedule-panel.renderer.js';
import { SchedulePanelSession } from '../../../events/schedules/schedule-panel.session.js';
import { EventSchedulesCollection } from '../../../firebase/collections/event-schedules.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import type { ScheduleSettings } from '../../../firebase/models/event-schedule.model.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const MISSING = "That schedule doesn't exist.";

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

    const id = interaction.options.getString('schedule', true);
    const schedules = await this.schedulesCollection.listForGuild(
      interaction.guildId,
    );
    const schedule = schedules.find((candidate) => candidate.id === id);
    if (!schedule) {
      await interaction.editReply(MISSING);
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

    const saved = await this.schedulesCollection.update(
      id,
      changedSettings(current, draft),
      interaction.user.id,
      new Date(),
    );
    await interaction.editReply({
      content: saved ? savedScheduleSummary(saved) : MISSING,
      embeds: [],
      components: [],
    });
  }

  async autocomplete(
    interaction: AutocompleteInteraction<'cached'>,
  ): Promise<void> {
    const schedules = await this.schedulesCollection.listForGuild(
      interaction.guildId,
    );
    await interaction.respond(
      scheduleChoices(schedules, interaction.options.getFocused()),
    );
  }
}

export { ScheduleEditCommandHandler };
