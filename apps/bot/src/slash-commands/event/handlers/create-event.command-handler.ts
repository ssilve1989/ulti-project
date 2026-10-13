import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  channelMention,
  MessageFlags,
  TimestampStyles,
  time,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { parseDiscordTime } from '../../../common/discord-time.js';
import { ComponentSessionService } from '../../../discord/component-session.service.js';
import { pickEncounters } from '../../../events/components/encounter-panel.js';
import { EventMessageService } from '../../../events/event-message.service.js';
import { EventsCollection } from '../../../firebase/collections/events.collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const BAD_START =
  "I couldn't read that start time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.";
const BAD_SIGNUPS_CLOSE =
  "I couldn't read that sign-up close time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.";
const CLOSE_AFTER_START = 'Sign-ups must close at or before the start time.';

type EventTimes =
  | { valid: true; startsAt: Date; signupsCloseAt: Date }
  | { valid: false; problem: string };

/** The start and sign-up close times, both in the future and closing no later than the start. */
function readTimes(
  start: string,
  signupsClose: string | null,
  now: number,
): EventTimes {
  const startsAt = parseDiscordTime(start);
  if (!startsAt || startsAt.getTime() <= now) {
    return { valid: false, problem: BAD_START };
  }
  const signupsCloseAt =
    signupsClose === null ? startsAt : parseDiscordTime(signupsClose);
  if (!signupsCloseAt || signupsCloseAt.getTime() <= now) {
    return { valid: false, problem: BAD_SIGNUPS_CLOSE };
  }
  if (signupsCloseAt > startsAt) {
    return { valid: false, problem: CLOSE_AFTER_START };
  }
  return { valid: true, startsAt, signupsCloseAt };
}

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'create' })
class CreateEventCommandHandler implements ISlashCommand {
  constructor(
    private readonly eventsCollection: EventsCollection,
    private readonly eventMessages: EventMessageService,
    private readonly sessions: ComponentSessionService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { options } = interaction;
    const times = readTimes(
      options.getString('start', true),
      options.getString('signups-close'),
      Date.now(),
    );
    if (!times.valid) {
      await interaction.editReply(times.problem);
      return;
    }

    const title = options.getString('title', true);
    const encounters = await pickEncounters(this.sessions, interaction, {
      summary: `**${title}** · starts ${time(times.startsAt, TimestampStyles.FullDateShortTime)} · sign-ups close ${time(times.signupsCloseAt, TimestampStyles.RelativeTime)}`,
      sessionName: 'event create',
    });
    if (!encounters) return;

    const event = await this.eventsCollection.create({
      guildId: interaction.guildId,
      title,
      startsAt: Timestamp.fromDate(times.startsAt),
      signupsCloseAt: Timestamp.fromDate(times.signupsCloseAt),
      encounters,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
    });
    // an event nobody can see would linger as active, so remove it and let the error report
    const message = await this.eventMessages
      .post(event)
      .catch(async (error: unknown) => {
        await this.eventsCollection.delete(event.id);
        throw error;
      });

    await interaction.editReply(
      `Posted **${title}** in ${channelMention(interaction.channelId)}: ${message.url}`,
    );
  }
}

export { CreateEventCommandHandler };
