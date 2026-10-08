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
  /** The last queued refresh per event; it never rejects, so one failure can't stall the rest. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly events: EventsCollection,
    private readonly settings: SettingsCollection,
    private readonly discord: DiscordService,
  ) {}

  /** Sends the event's message to its channel and stores the message id. */
  public async post(event: StoredEvent): Promise<Message<true>> {
    const channel = await this.discord.getTextChannel({
      guildId: event.guildId,
      channelId: event.channelId,
    });
    if (!channel || channel.isDMBased()) {
      throw new Error(
        `The channel ${event.channelId} for event ${event.id} was not found`,
      );
    }
    const message = await channel.send(await this.render(event));
    await this.events.setMessageId(event.id, message.id);
    return message;
  }

  /** Re-renders the event's message after any refresh already queued for it; resolves once this one's edit is done. */
  public refresh(eventId: string): Promise<void> {
    const previous = this.queues.get(eventId) ?? Promise.resolve();
    const next = previous.then(() => this.rerender(eventId));
    const tail = next.catch(() => undefined);
    this.queues.set(eventId, tail);
    void tail.finally(() => {
      if (this.queues.get(eventId) === tail) this.queues.delete(eventId);
    });
    return next;
  }

  private async rerender(eventId: string): Promise<void> {
    const event = await this.events.get(eventId);
    if (!event?.messageId) {
      this.logger.warn(`The event ${eventId} has no message to refresh`);
      return;
    }
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
