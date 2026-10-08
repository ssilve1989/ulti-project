import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  type Encounter,
  EncounterFriendlyDescription,
} from '@ulti-project/shared';
import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { ComponentSessionService } from '../../discord/component-session.service.js';
import { recordExpiredPrompt } from '../../discord/discord.helpers.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { EventStatus } from '../../firebase/models/event.model.js';
import { EventMessageService } from '../event-message.service.js';
import { ParticipantWithdrawnEvent } from './events.events.js';
import {
  EVENT_WITHDRAW_ENCOUNTER_ID,
  withdrawEncounterPrompt,
} from './signup-components.js';

const EXPIRED =
  'This withdrawal expired. Click Withdraw again if you still want to leave.';

/** A member's click on an event's Withdraw button. */
@Injectable()
export class EventWithdrawFlow {
  constructor(
    private readonly events: EventsCollection,
    private readonly sessions: ComponentSessionService,
    private readonly eventMessages: EventMessageService,
    private readonly eventBus: EventBus,
  ) {}

  async start(
    interaction: ButtonInteraction<'cached'>,
    eventId: string,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const event = await this.events.get(eventId);
    if (!event) {
      await interaction.editReply('This event no longer exists.');
      return;
    }
    if (event.status === EventStatus.Closed) {
      await interaction.editReply('This event is closed.');
      return;
    }

    const participants = await this.events.findParticipantsOf(
      eventId,
      interaction.user.id,
    );
    // in the event's order
    const signedUp = event.encounters.filter((encounter) =>
      participants.some((participant) => participant.encounter === encounter),
    );
    const [only, ...others] = signedUp;
    if (only === undefined) {
      await interaction.editReply("You're not signed up for this event.");
      return;
    }
    if (others.length === 0) {
      await this.withdraw(interaction, eventId, only);
      return;
    }

    const reply = await interaction.editReply(
      withdrawEncounterPrompt(signedUp),
    );
    const end = this.sessions.run(interaction, reply, {
      name: 'event withdraw',
      expiredContent: EXPIRED,
      onExpired: () => recordExpiredPrompt(interaction),
      onCollect: async (i) => {
        if (i.customId !== EVENT_WITHDRAW_ENCOUNTER_ID) return;
        if (!i.isStringSelectMenu()) return;
        const picked = signedUp.find((encounter) => encounter === i.values[0]);
        if (!picked) return;
        end();
        await i.deferUpdate();
        await this.withdraw(interaction, eventId, picked);
      },
    });
  }

  /** Removes the member's sign-up for `encounter`, telling the board what was removed. */
  private async withdraw(
    interaction: ButtonInteraction<'cached'>,
    eventId: string,
    encounter: Encounter,
  ): Promise<void> {
    const id = EventsCollection.participantId(interaction.user.id, encounter);
    const removed = await this.events.removeParticipant(eventId, id);
    if (removed) {
      this.eventBus.publish(
        new ParticipantWithdrawnEvent(eventId, { ...removed, id }),
      );
    }
    await interaction.editReply({
      content: `You've withdrawn from **${EncounterFriendlyDescription[encounter]}**.`,
      components: [],
    });
    await this.eventMessages.refresh(eventId);
  }
}
