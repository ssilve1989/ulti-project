import { Injectable } from '@nestjs/common';
import {
  type BoardEvent,
  type BoardEventSummary,
  type BoardParticipant,
  type BoardRoster,
  type Encounter,
  EncounterFriendlyDescription,
  JOB_ROLE,
} from '@ulti-project/shared';
import { titleCase } from 'title-case';
import { DiscordService } from '../../discord/discord.service.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { RostersCollection } from '../../firebase/collections/rosters.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type {
  ParticipantDocument,
  StoredEvent,
} from '../../firebase/models/event.model.js';
import type { RosterDocument } from '../../firebase/models/roster.model.js';
import { squadsOf } from '../squads.js';
import { isEventId } from './board-ids.js';

/** Reads a guild's events as the coordinator board shows them. */
@Injectable()
export class BoardEventReader {
  constructor(
    private readonly eventsCollection: EventsCollection,
    private readonly encountersCollection: EncountersCollection,
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
    private readonly rostersCollection: RostersCollection,
  ) {}

  /** The guild's events that aren't closed, earliest first. */
  async list(guildId: string): Promise<BoardEventSummary[]> {
    const events = await this.eventsCollection.findActive(guildId);
    return Promise.all(
      events.map(async (event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toDate().toISOString(),
        encounters: event.encounters,
        participantCount: (
          await this.eventsCollection.listParticipants(event.id)
        ).length,
      })),
    );
  }

  /** The event with its roster, or undefined if it's missing or another guild's. */
  async get(guildId: string, eventId: string): Promise<BoardEvent | undefined> {
    const event = await this.event(guildId, eventId);
    if (event === undefined) return undefined;
    const [documents, encounters, settings, rosters] = await Promise.all([
      this.eventsCollection.listParticipants(eventId),
      Promise.all(
        event.encounters.map(async (id) => {
          const encounter = await this.encountersCollection.getEncounter(id);
          return {
            id,
            name: EncounterFriendlyDescription[id],
            ...(encounter?.progPartyThreshold !== undefined && {
              progPartyThreshold: encounter.progPartyThreshold,
            }),
            ...(encounter?.clearPartyThreshold !== undefined && {
              clearPartyThreshold: encounter.clearPartyThreshold,
            }),
          };
        }),
      ),
      this.settingsCollection.getSettings(guildId),
      this.rostersCollection.list(eventId),
    ]);
    const squads = squadsOf(settings);
    const squadIds = new Set(squads.map(({ id }) => id));
    return {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toDate().toISOString(),
      signupsCloseAt: event.signupsCloseAt.toDate().toISOString(),
      status: event.status,
      encounters,
      participants: await this.participants(guildId, documents),
      squads: squads.map(({ id, name, tag, color }) => ({
        id,
        name,
        tag,
        color,
      })),
      // a squad the guild no longer has is hidden, as its claims are
      rosters: rosters
        .filter(({ squadId }) => squadIds.has(squadId))
        .map(BoardEventReader.boardRoster),
    };
  }

  /** The squad's roster for the encounter, with no teams if it has none, or it's another guild's. */
  async roster(
    guildId: string,
    eventId: string,
    encounter: Encounter,
    squadId: string,
  ): Promise<BoardRoster> {
    const document = await this.rostersCollection.get(
      eventId,
      encounter,
      squadId,
    );
    return document?.guildId === guildId
      ? BoardEventReader.boardRoster(document)
      : { encounter, squadId, teams: [] };
  }

  /** One participant of the event, or undefined if they or the event are missing, or it's another guild's. */
  async participant(
    guildId: string,
    eventId: string,
    participantId: string,
  ): Promise<BoardParticipant | undefined> {
    const event = await this.event(guildId, eventId);
    if (event === undefined) return undefined;
    const document = (
      await this.eventsCollection.listParticipants(eventId)
    ).find(
      ({ discordId, encounter }) =>
        EventsCollection.participantId(discordId, encounter) === participantId,
    );
    if (document === undefined) return undefined;
    const [participant] = await this.participants(guildId, [document]);
    return participant;
  }

  /** The event, or undefined if `eventId` isn't an event id, or it's missing or another guild's. */
  async event(
    guildId: string,
    eventId: string,
  ): Promise<StoredEvent | undefined> {
    if (!isEventId(eventId)) return undefined;
    const event = await this.eventsCollection.get(eventId);
    return event?.guildId === guildId ? event : undefined;
  }

  private static boardRoster({
    encounter,
    squadId,
    teams,
  }: RosterDocument): BoardRoster {
    return { encounter, squadId, teams };
  }

  /**
   * The participants as the board shows them, named by one fetch of their
   * guild members. A claim by a squad the guild no longer has is shown as none.
   */
  private async participants(
    guildId: string,
    documents: readonly ParticipantDocument[],
  ): Promise<BoardParticipant[]> {
    const memberIds = [...new Set(documents.map(({ discordId }) => discordId))];
    const [members, settings] = await Promise.all([
      this.discordService.getGuildMembers({ guildId, memberIds }),
      this.settingsCollection.getSettings(guildId),
    ]);
    const squadIds = new Set(squadsOf(settings).map(({ id }) => id));
    return documents.map((document) => ({
      id: EventsCollection.participantId(
        document.discordId,
        document.encounter,
      ),
      encounter: document.encounter,
      discordId: document.discordId,
      // a member who has left is named by their character
      displayName:
        members.get(document.discordId)?.displayName ??
        titleCase(document.character),
      character: document.character,
      world: document.world,
      job: document.job,
      jobRole: JOB_ROLE[document.job],
      phase: {
        label: document.phase.label,
        order: document.phase.order,
        bucket: document.phase.bucket,
      },
      claim:
        document.claim && squadIds.has(document.claim.squadId)
          ? {
              squadId: document.claim.squadId,
              claimedBy: document.claim.claimedBy,
              claimedAt: document.claim.claimedAt.toDate().toISOString(),
            }
          : null,
    }));
  }
}
