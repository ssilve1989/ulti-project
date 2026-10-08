import { Injectable } from '@nestjs/common';
import {
  type Encounter,
  EncounterFriendlyDescription,
  isJob,
  JOB_NAME,
  SignupStatus,
} from '@ulti-project/shared';
import {
  type ButtonInteraction,
  type GuildMember,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
  TimestampStyles,
  time,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { ComponentSessionService } from '../../discord/component-session.service.js';
import {
  isCollectorTimeout,
  recordExpiredPrompt,
} from '../../discord/discord.helpers.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  type EventPhase,
  EventStatus,
} from '../../firebase/models/event.model.js';
import { EventEligibilityService } from '../eligibility/event-eligibility.service.js';
import { EventMessageService } from '../event-message.service.js';
import { jobBadge } from '../render/event-message.renderer.js';
import {
  characterInputSchema,
  characterModal,
  EVENT_SIGNUP_ENCOUNTER_ID,
  EVENT_SIGNUP_JOB_ID,
  EVENT_SIGNUP_MODAL_ID,
  jobPrompt,
  signupEncounterPrompt,
} from './signup-components.js';

const MODAL_TIMEOUT_MS = 5 * 60_000;
const EXPIRED =
  'This sign-up expired. Click Sign up again if you still want to join.';

interface Choice {
  encounter: Encounter;
  phase: EventPhase;
}

/** A member's click on an event's Sign up button. */
@Injectable()
export class EventSignupFlow {
  constructor(
    private readonly events: EventsCollection,
    private readonly eligibility: EventEligibilityService,
    private readonly signups: SignupCollection,
    private readonly settings: SettingsCollection,
    private readonly sessions: ComponentSessionService,
    private readonly eventMessages: EventMessageService,
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
    // the deadline holds even before the scheduler marks sign-ups closed
    if (
      event.status !== EventStatus.Open ||
      Date.now() >= event.signupsCloseAt.toMillis()
    ) {
      const closedAt = time(
        event.signupsCloseAt.toDate(),
        TimestampStyles.RelativeTime,
      );
      await interaction.editReply(
        `Sign-ups for this event closed ${closedAt}.`,
      );
      return;
    }

    const choices = await this.eligibleChoices(
      interaction.member,
      event.encounters,
    );
    if (choices.length === 0) {
      const names = new Intl.ListFormat('en', { type: 'disjunction' }).format(
        event.encounters.map(
          (encounter) => EncounterFriendlyDescription[encounter],
        ),
      );
      await interaction.editReply(
        `You need a prog-point role for ${names} to sign up.`,
      );
      return;
    }

    const settings = await this.settings.getSettings(interaction.guildId);
    const jobEmojis = settings?.jobEmojis ?? {};
    let chosen = choices.length === 1 ? choices[0] : undefined;
    const reply = await interaction.editReply(
      chosen
        ? jobPrompt(chosen.encounter, jobEmojis)
        : signupEncounterPrompt(choices.map(({ encounter }) => encounter)),
    );

    const end = this.sessions.run(interaction, reply, {
      name: 'event signup',
      expiredContent: EXPIRED,
      onExpired: () => recordExpiredPrompt(interaction),
      onCollect: async (i) => {
        if (!i.isStringSelectMenu()) return;
        const [value] = i.values;
        if (i.customId === EVENT_SIGNUP_ENCOUNTER_ID) {
          chosen = choices.find(({ encounter }) => encounter === value);
          if (chosen) await i.update(jobPrompt(chosen.encounter, jobEmojis));
          return;
        }
        const choice = chosen;
        if (i.customId !== EVENT_SIGNUP_JOB_ID || !choice) return;
        if (value === undefined || !isJob(value)) return;

        const character = await this.characterFor(i, choice.encounter);
        if (!character) return;
        end();
        await this.events.upsertParticipant(eventId, {
          discordId: interaction.user.id,
          encounter: choice.encounter,
          job: value,
          ...character,
          phase: choice.phase,
          signedUpAt: Timestamp.now(),
        });
        await interaction.editReply({
          content: `You're signed up for **${EncounterFriendlyDescription[choice.encounter]}** as ${jobBadge(value, jobEmojis)} ${JOB_NAME[value]}.`,
          components: [],
        });
        await this.eventMessages.refresh(eventId);
      },
    });
  }

  /** The event's encounters the member may sign up for, with their phase in each. */
  private async eligibleChoices(
    member: GuildMember,
    encounters: readonly Encounter[],
  ): Promise<Choice[]> {
    const choices: Choice[] = [];
    for (const encounter of encounters) {
      const eligibility = await this.eligibility.resolve(member, encounter);
      if (eligibility.eligible) {
        choices.push({ encounter, phase: eligibility.phase });
      }
    }
    return choices;
  }

  /**
   * The character and world from the member's reviewed signup, or else from
   * the character modal, answering the job pick either way. Undefined when
   * the modal isn't submitted or its input is invalid (they're told why, and
   * can pick a job again).
   */
  private async characterFor(
    i: MessageComponentInteraction<'cached'>,
    encounter: Encounter,
  ): Promise<{ character: string; world: string } | undefined> {
    const signup = await this.signups.findById(
      SignupCollection.getKeyForSignup({ discordId: i.user.id, encounter }),
    );
    if (
      signup?.status === SignupStatus.APPROVED ||
      signup?.status === SignupStatus.UPDATE_PENDING
    ) {
      await i.deferUpdate();
      return { character: signup.character, world: signup.world };
    }

    await i.showModal(characterModal());
    let submit: ModalSubmitInteraction;
    try {
      submit = await i.awaitModalSubmit({
        time: MODAL_TIMEOUT_MS,
        filter: (s) =>
          s.user.id === i.user.id && s.customId === EVENT_SIGNUP_MODAL_ID,
      });
    } catch (error) {
      // Discord doesn't tell the bot a modal was dismissed; the session expiry tells the member
      if (isCollectorTimeout(error)) return undefined;
      throw error;
    }

    const parsed = characterInputSchema.safeParse({
      character: submit.fields.getTextInputValue('character'),
      world: submit.fields.getTextInputValue('world'),
    });
    if (!parsed.success) {
      await submit.reply({
        content: parsed.error.issues.map(({ message }) => message).join('\n'),
        flags: MessageFlags.Ephemeral,
      });
      return undefined;
    }
    await submit.deferUpdate();
    return parsed.data;
  }
}
