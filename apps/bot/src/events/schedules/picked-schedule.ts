import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { EventSchedulesCollection } from '../../firebase/collections/event-schedules.collection.js';
import type { StoredSchedule } from '../../firebase/models/event-schedule.model.js';
import { scheduleChoices } from './schedule-choices.js';

export const SCHEDULE_MISSING = "That schedule doesn't exist.";

/** The schedule picked in the `schedule` option, if it belongs to this guild. */
export async function pickedSchedule(
  schedules: EventSchedulesCollection,
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<StoredSchedule | undefined> {
  const id = interaction.options.getString('schedule', true);
  const guildSchedules = await schedules.listForGuild(interaction.guildId);
  return guildSchedules.find((schedule) => schedule.id === id);
}

/** Offers this guild's schedules for the `schedule` option. */
export async function autocompleteSchedules(
  schedules: EventSchedulesCollection,
  interaction: AutocompleteInteraction<'cached'>,
): Promise<void> {
  const guildSchedules = await schedules.listForGuild(interaction.guildId);
  await interaction.respond(
    scheduleChoices(guildSchedules, interaction.options.getFocused()),
  );
}
