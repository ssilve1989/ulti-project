import type { Encounter } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { ComponentSessionService } from '../../discord/component-session.service.js';
import {
  EVENT_ENCOUNTERS_SELECT_ID,
  encounterSelect,
  readEncounterSelection,
} from './encounter-select.js';

const POST_ID = 'eventPost';
const CANCEL_ID = 'eventCancel';

/** The panel's components with `encounters` picked; Post needs at least one. */
function panelComponents(
  encounters: readonly Encounter[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    encounterSelect(EVENT_ENCOUNTERS_SELECT_ID, encounters),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(POST_ID)
        .setLabel('Post')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(encounters.length === 0),
      new ButtonBuilder()
        .setCustomId(CANCEL_ID)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/**
 * Shows the encounter panel under `summary` in `interaction`'s deferred reply.
 * Resolves with the picked encounters on Post, leaving the caller to replace
 * the panel, or with undefined once the admin cancels or lets it expire, or
 * the panel is deleted.
 */
export async function pickEncounters(
  sessions: ComponentSessionService,
  interaction: ChatInputCommandInteraction<'cached'>,
  { summary, sessionName }: { summary: string; sessionName: string },
): Promise<Encounter[] | undefined> {
  const reply = await interaction.editReply({
    content: summary,
    components: panelComponents([]),
  });
  const { promise, resolve } = Promise.withResolvers<Encounter[] | undefined>();
  let encounters: Encounter[] = [];

  const end = sessions.run(interaction, reply, {
    name: sessionName,
    expiredContent: 'This prompt expired.',
    onAbandoned: () => resolve(undefined),
    onCollect: async (i) => {
      if (i.isStringSelectMenu()) {
        encounters = readEncounterSelection(i.values);
        await i.update({ components: panelComponents(encounters) });
      } else if (i.customId === POST_ID) {
        // stopping first ignores a second click while this one posts
        end();
        try {
          await i.update({ components: [] });
        } finally {
          resolve(encounters);
        }
      } else if (i.customId === CANCEL_ID) {
        end();
        resolve(undefined);
        await i.update({ content: 'Cancelled.', components: [] });
      }
    },
  });
  return promise;
}
