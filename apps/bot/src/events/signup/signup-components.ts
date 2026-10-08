import {
  type Encounter,
  EncounterFriendlyDescription,
  JOB_NAME,
  JOBS,
  type Job,
} from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { z } from 'zod';
import {
  characterSchema,
  worldSchema,
} from '../../slash-commands/signup/signup.schema.js';

// Ids inside the private reply; kept out of the persistent `event:` namespace,
// which EventComponentsListener handles
export const EVENT_SIGNUP_ENCOUNTER_ID = 'eventSignupEncounter';
export const EVENT_SIGNUP_JOB_ID = 'eventSignupJob';
export const EVENT_SIGNUP_MODAL_ID = 'eventSignupCharacterModal';
export const EVENT_WITHDRAW_ENCOUNTER_ID = 'eventWithdrawEncounter';

/** The character modal's input, with the same rules as /signup. */
export const characterInputSchema = z.object({
  character: characterSchema,
  world: worldSchema,
});

/** Asks which of `encounters` to sign up for. */
export const signupEncounterPrompt = (encounters: readonly Encounter[]) => ({
  content: 'Which encounter are you signing up for?',
  components: [encounterSelectRow(EVENT_SIGNUP_ENCOUNTER_ID, encounters)],
});

/** Asks which of `encounters` to withdraw from. */
export const withdrawEncounterPrompt = (encounters: readonly Encounter[]) => ({
  content: 'Which encounter are you withdrawing from?',
  components: [encounterSelectRow(EVENT_WITHDRAW_ENCOUNTER_ID, encounters)],
});

/** Asks for the job to play in `encounter`. */
export const jobPrompt = (
  encounter: Encounter,
  jobEmojis: Partial<Record<Job, string>>,
) => ({
  content: `Pick your job for **${EncounterFriendlyDescription[encounter]}**.`,
  components: [jobSelectRow(jobEmojis)],
});

function encounterSelectRow(
  customId: string,
  encounters: readonly Encounter[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Encounter')
      .addOptions(
        encounters.map((encounter) => ({
          label: EncounterFriendlyDescription[encounter],
          value: encounter,
        })),
      ),
  );
}

/** A select of every job, each with its emoji when one is set. */
function jobSelectRow(
  jobEmojis: Partial<Record<Job, string>>,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(EVENT_SIGNUP_JOB_ID)
      .setPlaceholder('Your job')
      .addOptions(
        JOBS.map((job) => {
          const emojiId = jobEmojis[job];
          return {
            label: JOB_NAME[job],
            value: job,
            ...(emojiId && { emoji: { id: emojiId } }),
          };
        }),
      ),
  );
}

/** Asks for the character and world to sign up with. */
export function characterModal(): ModalBuilder {
  const input = (customId: string, label: string, maxLength: number) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(maxLength)
        .setRequired(true),
    );
  return new ModalBuilder()
    .setCustomId(EVENT_SIGNUP_MODAL_ID)
    .setTitle('Your character')
    .addComponents(
      input('character', 'Character', 64),
      input('world', 'World', 32),
    );
}
