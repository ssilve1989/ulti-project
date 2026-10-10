const TIME_OF_DAY = /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i;

/**
 * Reads a time an organizer types (`20:00`, `8pm`, `8:30 pm`) as `HH:mm`.
 * A 24-hour time needs its minutes; a 12-hour one needs am/pm.
 */
export function parseTimeOfDay(input: string): string | undefined {
  const match = TIME_OF_DAY.exec(input.trim());
  if (!match) return undefined;
  const [, hourText, minuteText, meridiem] = match;
  if (minuteText === undefined && meridiem === undefined) return undefined;

  const minute = Number(minuteText ?? '0');
  if (minute > 59) return undefined;

  let hour = Number(hourText);
  if (meridiem === undefined) {
    if (hour > 23) return undefined;
  } else {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
