import { Injectable } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
} from 'discord.js';
import { ComponentSessionService } from '../../discord/component-session.service.js';
import { recordExpiredPrompt } from '../../discord/discord.helpers.js';
import {
  SCHEDULE_TIME_ZONES,
  type ScheduleTimeZone,
  type Weekday,
  Weekdays,
} from './next-occurrence.js';
import {
  renderSchedulePanel,
  SCHEDULE_CANCEL_ID,
  SCHEDULE_DAYS_SELECT_ID,
  SCHEDULE_SAVE_ID,
  SCHEDULE_ZONE_SELECT_ID,
  type ScheduleDraft,
} from './schedule-panel.renderer.js';

const EXPIRED = 'This schedule panel expired. Nothing was saved.';

const isWeekday = (value: string): value is Weekday =>
  Weekdays.some((day) => day === value);

const isScheduleTimeZone = (
  value: string | undefined,
): value is ScheduleTimeZone =>
  SCHEDULE_TIME_ZONES.some((zone) => zone === value);

/** The organizer's days and timezone picks on the schedule panel. */
@Injectable()
export class SchedulePanelSession {
  constructor(private readonly sessions: ComponentSessionService) {}

  /**
   * Shows the panel for `draft` in `interaction`'s deferred reply. Resolves
   * with the draft as picked on Save, leaving the caller to replace the panel,
   * or with undefined once the organizer cancels or lets it expire.
   */
  async open(
    interaction: ChatInputCommandInteraction<'cached'>,
    draft: ScheduleDraft,
    mode: 'create' | 'edit',
  ): Promise<ScheduleDraft | undefined> {
    const reply = await interaction.editReply(
      renderSchedulePanel(draft, new Date(), mode),
    );
    const { promise, resolve } = Promise.withResolvers<
      ScheduleDraft | undefined
    >();
    let current = draft;

    const pick = async (
      i: MessageComponentInteraction<'cached'>,
      changes: Partial<ScheduleDraft>,
    ) => {
      current = { ...current, ...changes };
      await i.update(renderSchedulePanel(current, new Date(), mode));
    };

    const end = this.sessions.run(interaction, reply, {
      name: `schedule ${mode}`,
      expiredContent: EXPIRED,
      // the preview describes a schedule that was never saved
      clearEmbedsOnExpiry: true,
      onExpired: () => {
        recordExpiredPrompt(interaction);
        resolve(undefined);
      },
      onCollect: async (i) => {
        if (i.isStringSelectMenu()) {
          const [zone] = i.values;
          if (i.customId === SCHEDULE_DAYS_SELECT_ID) {
            await pick(i, { weekdays: i.values.filter(isWeekday) });
          } else if (
            i.customId === SCHEDULE_ZONE_SELECT_ID &&
            isScheduleTimeZone(zone)
          ) {
            await pick(i, { timeZone: zone });
          }
          return;
        }
        if (i.customId === SCHEDULE_SAVE_ID) {
          end();
          // no more clicks while it saves; the caller then replaces the panel
          try {
            await i.update({ content: 'Saving…', components: [] });
          } finally {
            resolve(current);
          }
        } else if (i.customId === SCHEDULE_CANCEL_ID) {
          end();
          resolve(undefined);
          await i.update({
            content: 'Nothing saved.',
            embeds: [],
            components: [],
          });
        }
      },
    });
    return promise;
  }
}
