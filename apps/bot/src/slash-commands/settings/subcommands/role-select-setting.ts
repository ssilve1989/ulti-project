import type { ChatInputCommandInteraction } from 'discord.js';
import {
  ActionRowBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
} from 'discord.js';
import type { ComponentSessionService } from '../../../discord/component-session.service.js';
import type { SettingsCollection } from '../../../firebase/collections/settings-collection.js';

/** The settings that hold a list of role ids chosen with a role menu */
type RoleListField = 'eventOrganizerRoles' | 'boardViewerRoles';

interface RoleSelectSettingServices {
  settingsCollection: SettingsCollection;
  componentSessions: ComponentSessionService;
}

interface RoleSelectSettingOptions {
  field: RoleListField;
  /** Shown above the menu, and above each save's confirmation */
  instructions: string;
  select: { customId: string; placeholder: string };
  /** The confirmation for a non-empty selection */
  saved: (roleIds: string[]) => string;
  /** The confirmation for an empty selection */
  emptySaved: string;
  expiredContent: string;
  sessionName: string;
}

function createRoleSelectRow(
  { customId, placeholder }: RoleSelectSettingOptions['select'],
  currentIds: string[],
) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25)
    .setDefaultRoles(currentIds);

  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
}

/**
 * Shows the invoking admin a role menu for `field`, and saves each selection,
 * which replaces the stored list, with a confirmation under the menu.
 */
export async function runRoleSelectSetting(
  interaction: ChatInputCommandInteraction<'cached'>,
  { settingsCollection, componentSessions }: RoleSelectSettingServices,
  {
    field,
    instructions,
    select,
    saved,
    emptySaved,
    expiredContent,
    sessionName,
  }: RoleSelectSettingOptions,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = await settingsCollection.getSettings(interaction.guildId);

  const replyMessage = await interaction.editReply({
    content: instructions,
    components: [createRoleSelectRow(select, settings?.[field] ?? [])],
  });

  componentSessions.run(interaction, replyMessage, {
    name: sessionName,
    expiredContent,
    onCollect: async (i) => {
      if (i.customId !== select.customId || !i.isRoleSelectMenu()) {
        return;
      }

      await i.deferUpdate();

      const roleIds = i.values;

      await settingsCollection.upsert(interaction.guildId, {
        [field]: roleIds,
      });

      const confirmation = roleIds.length > 0 ? saved(roleIds) : emptySaved;

      await i.editReply({
        content: `${instructions}\n\n${confirmation}`,
        components: [createRoleSelectRow(select, roleIds)],
      });
    },
  });
}
