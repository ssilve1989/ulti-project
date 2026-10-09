import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EncounterFriendlyDescription, JOB_NAME } from '@ulti-project/shared';
import {
  DiscordAPIError,
  EmbedBuilder,
  hyperlink,
  messageLink,
  RESTJSONErrorCodes,
  TimestampStyles,
  time,
  userMention,
} from 'discord.js';
import { titleCase } from 'title-case';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { jobBadge } from '../../events/render/event-message.renderer.js';
import { ParticipantWithdrawnEvent } from '../../events/signup/events.events.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type {
  ParticipantDocument,
  StoredEvent,
} from '../../firebase/models/event.model.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';

type Claim = NonNullable<ParticipantDocument['claim']>;

/** Why Discord refuses a post to a channel that's gone or that the bot may not use. */
const UNPOSTABLE: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

const isUnpostable = (error: unknown) =>
  error instanceof DiscordAPIError && UNPOSTABLE.has(error.code);

/**
 * Tells the guild's moderators when a player a squad had claimed leaves an
 * event. The withdrawal has already happened, so the alert never throws: one
 * with nowhere to go is only logged, and anything else is reported.
 */
@EventsHandler(ParticipantWithdrawnEvent)
export class ClaimedWithdrawalHandler
  implements IEventHandler<ParticipantWithdrawnEvent>
{
  private readonly logger = new Logger(ClaimedWithdrawalHandler.name);

  constructor(
    private readonly events: EventsCollection,
    private readonly settings: SettingsCollection,
    private readonly discord: DiscordService,
    private readonly errors: ErrorService,
  ) {}

  async handle(withdrawn: ParticipantWithdrawnEvent): Promise<void> {
    const { claim } = withdrawn.participant;
    if (!claim) return;
    try {
      await this.alert(withdrawn, claim);
    } catch (error) {
      if (isUnpostable(error)) {
        this.warn(withdrawn, String(error));
        return;
      }
      this.errors.captureError(error, {
        message: 'claimed-withdrawal alert failed',
      });
    }
  }

  private async alert(
    withdrawn: ParticipantWithdrawnEvent,
    claim: Claim,
  ): Promise<void> {
    const event = await this.events.get(withdrawn.eventId);
    if (!event) {
      this.warn(withdrawn, 'the event no longer exists');
      return;
    }
    const settings = await this.settings.getSettings(event.guildId);
    const channelId = settings?.autoModChannelId;
    if (!channelId) {
      this.warn(withdrawn, 'the guild has no moderation channel');
      return;
    }
    const channel = await this.discord.getTextChannel({
      guildId: event.guildId,
      channelId,
    });
    if (!channel) {
      this.warn(withdrawn, `${channelId} is not a text channel`);
      return;
    }
    await channel.send({
      embeds: [claimedWithdrawalEmbed(withdrawn, claim, event, settings)],
      allowedMentions: { parse: [] },
    });
  }

  private warn(
    { eventId, participant }: ParticipantWithdrawnEvent,
    why: string,
  ): void {
    this.logger.warn(
      `Could not alert moderators that claimed ${participant.id} left event ${eventId}: ${why}`,
    );
  }
}

function claimedWithdrawalEmbed(
  { participant, reason }: ParticipantWithdrawnEvent,
  claim: Claim,
  event: StoredEvent,
  settings: SettingsDocument,
): EmbedBuilder {
  const { discordId, character, world, job, phase, encounter } = participant;
  const title = event.messageId
    ? hyperlink(
        event.title,
        messageLink(event.channelId, event.messageId, event.guildId),
      )
    : event.title;
  const squad = settings.squads?.[claim.squadId];
  return new EmbedBuilder()
    .setTitle(
      reason === 'withdrew'
        ? 'Claimed player withdrew'
        : 'Claimed player removed',
    )
    .addFields(
      {
        name: 'Player',
        value: `${userMention(discordId)} ${titleCase(character)}@${titleCase(world)}`,
      },
      {
        name: 'Job',
        value: `${jobBadge(job, settings.jobEmojis ?? {})} ${JOB_NAME[job]}`,
      },
      { name: 'Phase', value: phase.label },
      {
        name: 'Event',
        value: `${title} · ${time(event.startsAt.toDate(), TimestampStyles.FullDateShortTime)}`,
      },
      { name: 'Encounter', value: EncounterFriendlyDescription[encounter] },
      {
        name: 'Squad',
        // a squad deleted since the claim leaves only its id
        value: squad ? `${squad.name} (${squad.tag})` : claim.squadId,
      },
      {
        name: 'Claimed by',
        value: `${userMention(claim.claimedBy)} ${time(claim.claimedAt.toDate(), TimestampStyles.RelativeTime)}`,
      },
      {
        name: 'Withdrew',
        value: time(new Date(), TimestampStyles.RelativeTime),
      },
    );
}
