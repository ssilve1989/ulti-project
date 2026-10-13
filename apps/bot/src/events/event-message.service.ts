import { Injectable, Logger } from '@nestjs/common';
import { EncounterFriendlyDescription } from '@ulti-project/shared';
import type { Message } from 'discord.js';
import { DiscordService } from '../discord/discord.service.js';
import { EventsCollection } from '../firebase/collections/events.collection.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import type { StoredEvent } from '../firebase/models/event.model.js';
import {
  type EventMessage,
  renderEventMessage,
} from './render/event-message.renderer.js';

@Injectable()
export class EventMessageService {
  private readonly logger = new Logger(EventMessageService.name);
  /** The last queued refresh or move per event; it never rejects, so one failure can't stall the rest. */
  private readonly queues = new Map<string, Promise<void>>();
  /** A queued refresh per event that hasn't started: it will render every change made before it does. */
  private readonly waitingRefreshes = new Map<string, Promise<void>>();

  constructor(
    private readonly events: EventsCollection,
    private readonly settings: SettingsCollection,
    private readonly discord: DiscordService,
  ) {}

  /** Sends the event's message to its channel and stores the message id. */
  public async post(event: StoredEvent): Promise<Message<true>> {
    const message = await this.send(event, event.channelId);
    await this.events.setMessage(event.id, event.channelId, message.id);
    return message;
  }

  /**
   * Posts the event in `channelId`, stores it there, then deletes its old
   * message; one that can't be deleted is only logged. Rejects, leaving the
   * event where it was, if it can't be posted there. Queued with the event's
   * refreshes, so none edits the old message or renders it in between.
   */
  public move(event: StoredEvent, channelId: string): Promise<void> {
    // a refresh asked for after the move must render after it
    this.waitingRefreshes.delete(event.id);
    return this.enqueue(event.id, () => this.moveNow(event, channelId));
  }

  /**
   * Re-renders the event's message after any refresh already queued for it;
   * resolves once that edit is done. A refresh still waiting to start is
   * shared, since it will render this change too.
   */
  public refresh(eventId: string): Promise<void> {
    const waiting = this.waitingRefreshes.get(eventId);
    if (waiting) return waiting;
    const refresh = this.enqueue(eventId, () => {
      // after a move, a newer refresh may be the one waiting
      if (this.waitingRefreshes.get(eventId) === refresh) {
        this.waitingRefreshes.delete(eventId);
      }
      return this.rerender(eventId);
    });
    this.waitingRefreshes.set(eventId, refresh);
    return refresh;
  }

  /** Runs `task` after every task already queued for the event; settles with it. */
  private enqueue(eventId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(eventId) ?? Promise.resolve();
    const next = previous.then(task);
    const tail = next.catch(() => undefined);
    this.queues.set(eventId, tail);
    void tail.finally(() => {
      if (this.queues.get(eventId) === tail) this.queues.delete(eventId);
    });
    return next;
  }

  private async moveNow(event: StoredEvent, channelId: string): Promise<void> {
    const message = await this.send(event, channelId);
    await this.events.setMessage(event.id, channelId, message.id);
    if (!event.messageId) return;
    try {
      await this.discord.deleteMessage(
        event.guildId,
        event.channelId,
        event.messageId,
      );
    } catch (error) {
      this.logger.warn(
        `The old message ${event.messageId} for event ${event.id} could not be deleted: ${String(error)}`,
      );
    }
  }

  private async rerender(eventId: string): Promise<void> {
    const event = await this.events.get(eventId);
    if (!event) {
      this.logger.warn(`The event ${eventId} has no message to refresh`);
      return;
    }
    // an event synced without posting has no message yet
    if (!event.messageId) return;
    const message = await this.discord.fetchMessage(
      event.guildId,
      event.channelId,
      event.messageId,
    );
    if (!message) {
      this.logger.warn(
        `The message ${event.messageId} for event ${eventId} was not found`,
      );
      return;
    }
    await message.edit(await this.render(event));
  }

  private async send(
    event: StoredEvent,
    channelId: string,
  ): Promise<Message<true>> {
    const channel = await this.discord.getTextChannel({
      guildId: event.guildId,
      channelId,
    });
    if (!channel || channel.isDMBased()) {
      throw new Error(
        `The channel ${channelId} for event ${event.id} was not found`,
      );
    }
    return channel.send(await this.render(event));
  }

  private async render(event: StoredEvent): Promise<EventMessage> {
    const [participants, settings] = await Promise.all([
      this.events.listParticipants(event.id),
      this.settings.getSettings(event.guildId),
    ]);
    return renderEventMessage({
      event,
      participants,
      jobEmojis: settings?.jobEmojis ?? {},
      encounterNames: EncounterFriendlyDescription,
      now: new Date(),
    });
  }
}
