import { ActionRowBuilder, RoleSelectMenuBuilder } from 'discord.js';

export const EVENT_ORGANIZERS_SELECT_ID = 'eventOrganizersSelect';

export function createEventOrganizersSelectRow(currentIds: string[]) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(EVENT_ORGANIZERS_SELECT_ID)
    .setPlaceholder('Select event organizer roles')
    .setMinValues(0)
    .setMaxValues(25)
    .setDefaultRoles(currentIds);

  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
}
