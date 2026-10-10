import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  escapeMarkdown,
  MessageFlags,
  messageLink,
  TimestampStyles,
  time,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { ComponentSessionService } from '../../../discord/component-session.service.js';
import { pickEncounters } from '../../../events/components/encounter-panel.js';
import { EventMessageService } from '../../../events/event-message.service.js';
import {
  RaidHelperSyncService,
  type SyncReport,
} from '../../../events/sync/raid-helper-sync.service.js';
import { EventsCollection } from '../../../firebase/collections/events.collection.js';
import {
  EventStatus,
  type StoredEvent,
} from '../../../firebase/models/event.model.js';
import {
  RaidHelperClient,
  type RaidHelperEvent,
} from '../../../raid-helper/raid-helper.client.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const RAID_HELPER_ID = /^\d{17,20}$/;
const REPLY_LIMIT = 2000;

/** Our event's id for Raid-Helper event `raidHelperId`, so syncing it again finds it. */
const syncedEventId = (raidHelperId: string) => `raid-helper-${raidHelperId}`;

/** `heading`, the counts, and whom it skipped and why, cut to fit one Discord message. */
export function syncReply(
  heading: string,
  { added, updated, removed, skipped }: SyncReport,
): string {
  let reply = `${heading}\nAdded ${added} · Updated ${updated} · Removed ${removed}`;
  if (skipped.length === 0) return reply;
  reply += '\n\nSkipped:';
  for (const [index, { name, reason }] of skipped.entries()) {
    const line = `\n- ${escapeMarkdown(name)}: ${reason}`;
    const more = `\n…and ${skipped.length - index} more`;
    if (reply.length + line.length + more.length > REPLY_LIMIT)
      return reply + more;
    reply += line;
  }
  return reply;
}

/** Why `source` can't be synced into `guildId`, or undefined if it can. */
function refusal(source: RaidHelperEvent, guildId: string): string | undefined {
  if (source.serverId !== guildId)
    return 'That Raid-Helper event belongs to another server.';
  if (source.startsAt.getTime() <= Date.now())
    return 'That Raid-Helper event has already started.';
  return undefined;
}

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'sync' })
class SyncEventCommandHandler implements ISlashCommand {
  constructor(
    private readonly raidHelper: RaidHelperClient,
    private readonly events: EventsCollection,
    private readonly eventMessages: EventMessageService,
    private readonly sessions: ComponentSessionService,
    private readonly syncService: RaidHelperSyncService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const raidHelperId = interaction.options
      .getString('raid-helper-id', true)
      .trim();
    if (!RAID_HELPER_ID.test(raidHelperId)) {
      await interaction.editReply("That isn't a Raid-Helper event id.");
      return;
    }
    const source = await this.raidHelper.getEvent(raidHelperId);
    if (!source) {
      await interaction.editReply("I couldn't find that Raid-Helper event.");
      return;
    }
    const refused = refusal(source, interaction.guildId);
    if (refused !== undefined) {
      await interaction.editReply(refused);
      return;
    }

    const post = interaction.options.getBoolean('post') ?? true;
    const existing = await this.events.get(syncedEventId(source.id));
    let event = existing ?? (await this.create(interaction, source));
    if (!event) return;
    if (event.status === EventStatus.Closed) {
      await interaction.editReply('This event is closed.');
      return;
    }
    if (post && !event.messageId) event = await this.post(event, !existing);

    const report = await this.syncService.sync(event, source);
    const link = event.messageId
      ? `: ${messageLink(event.channelId, event.messageId, event.guildId)}`
      : ' (not posted in Discord)';
    await interaction.editReply({
      content: syncReply(`Synced **${event.title}**${link}`, report),
      components: [],
    });
  }

  /** Asks for the encounters, then creates the event; undefined if the admin backs out. */
  private async create(
    interaction: ChatInputCommandInteraction<'cached'>,
    source: RaidHelperEvent,
  ): Promise<StoredEvent | undefined> {
    const { startsAt, closesAt } = source;
    const signupsCloseAt =
      closesAt && closesAt.getTime() > Date.now() && closesAt <= startsAt
        ? closesAt
        : startsAt;
    const title = source.title.trim().slice(0, 100);
    const encounters = await pickEncounters(this.sessions, interaction, {
      summary: `**${title}** · starts ${time(startsAt, TimestampStyles.FullDateShortTime)} · sign-ups close ${time(signupsCloseAt, TimestampStyles.RelativeTime)}`,
      sessionName: 'event sync',
    });
    if (!encounters) return undefined;

    // a deterministic id: syncing the same event twice stores one event (two admins posting at once could still both post it)
    return this.events.createIfAbsent(syncedEventId(source.id), {
      guildId: interaction.guildId,
      title,
      startsAt: Timestamp.fromDate(startsAt),
      signupsCloseAt: Timestamp.fromDate(signupsCloseAt),
      encounters,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
    });
  }

  /** Posts the event in its channel; if it was just created, a failed post removes it before rethrowing. */
  private async post(
    event: StoredEvent,
    created: boolean,
  ): Promise<StoredEvent> {
    const message = await this.eventMessages
      .post(event)
      .catch(async (error: unknown) => {
        // an event nobody can see would linger as active, so remove it and let the error report
        if (created) await this.events.delete(event.id);
        throw error;
      });
    return { ...event, messageId: message.id };
  }
}

export { SyncEventCommandHandler };
