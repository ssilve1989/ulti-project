import type { ApplicationCommandOptionChoiceData } from 'discord.js';
import type { StoredSchedule } from '../../firebase/models/event-schedule.model.js';
import { shortDays } from './schedule-panel.renderer.js';

/** Discord's limits on autocomplete choices and their names. */
const MAX_CHOICES = 25;
const MAX_NAME_LENGTH = 100;

/** Autocomplete choices for the schedules whose title contains `focused`, as `title · Tue, Thu 20:00`. */
export function scheduleChoices(
  schedules: readonly StoredSchedule[],
  focused: string,
): ApplicationCommandOptionChoiceData<string>[] {
  const typed = focused.toLowerCase();
  return schedules
    .filter((schedule) => schedule.title.toLowerCase().includes(typed))
    .slice(0, MAX_CHOICES)
    .map((schedule) => ({
      name: `${schedule.title} · ${shortDays(schedule.weekdays)} ${schedule.startTime}`.slice(
        0,
        MAX_NAME_LENGTH,
      ),
      value: schedule.id,
    }));
}
