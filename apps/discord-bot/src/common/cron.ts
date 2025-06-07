/**
 * CronTime helper to create cron time strings
 * @example
 * ```ts
 * CronTime.everyDay().at(3); // '0 0 3 * * *'
 * CronTime.everyDay().at(3, 30); // '0 30 3 * * *'
 * CronTime.everyDay().at(3, 30, 15); // '15 30 3 * * *'
 * CronTime.everyHour().at(30); // '0 30 * * * *'
 * CronTime.everyHour().at(30, 15); // '15 30 * * * *'
 */
export const CronTime = {
  everyDay: () => ({
    at: (hour: number, minute = 0, second = 0) =>
      `${second} ${minute} ${hour} * * *`,
  }),
  everyHour: () => ({
    at: (minute: number, second = 0) => `${second} ${minute} * * * *`,
  }),
  everyWeek: () => ({
    on: (dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6) => ({
      at: (hour: number, minute = 0, second = 0) =>
        `${second} ${minute} ${hour} * * ${dayOfWeek}`,
    }),
  }),
  everyMonth: () => ({
    on: (dayOfMonth: number) => ({
      at: (hour: number, minute = 0, second = 0) =>
        `${second} ${minute} ${hour} ${dayOfMonth} * *`,
    }),
  }),
} as const;
