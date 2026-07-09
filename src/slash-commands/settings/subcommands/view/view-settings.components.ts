import type { APIEmbedField } from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  EmbedBuilder,
  roleMention,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  type Encounter,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import type { SettingsDocument } from '../../../../firebase/models/settings.model.js';

export const SETTINGS_VIEW_OVERVIEW_BUTTON_ID = 'settingsViewOverview';
export const SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID =
  'settingsViewEncounterRoles';
export const SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID =
  'settingsViewProgPointRoles';
export const SETTINGS_VIEW_ENCOUNTER_SELECT_ID = 'settingsViewEncounterSelect';

export type SettingsViewSection =
  | 'overview'
  | 'encounterRoles'
  | 'progPointRoles';

const EMBED_FIELD_VALUE_LIMIT = 1024;
const EMBED_DESCRIPTION_LIMIT = 4096;

export function formatRole(roleId?: string) {
  return roleId ? roleMention(roleId) : 'No Role Set';
}

export function formatChannel(channelId?: string) {
  return channelId ? channelMention(channelId) : 'No Channel Set';
}

export function reduceRoleSettings(
  roleSettings: Record<string, string | undefined> | undefined,
): string[] {
  return Object.entries(roleSettings || {}).reduce<string[]>(
    (acc, [encounter, role]) => {
      if (role) {
        acc.push(`**${encounter}:** ${roleMention(role)}`);
      }
      return acc;
    },
    [],
  );
}

export function buildTruncatedList(lines: string[], limit: number): string {
  const full = lines.join('\n');
  if (full.length <= limit) {
    return full;
  }

  for (let keepCount = lines.length - 1; keepCount > 0; keepCount--) {
    const omitted = lines.length - keepCount;
    const candidate = `${lines
      .slice(0, keepCount)
      .join('\n')}\n… and ${omitted} more`;
    if (candidate.length <= limit) {
      return candidate;
    }
  }

  return `… and ${lines.length} more`;
}

export function getConfiguredProgPointEncounters(
  progPointRoles: SettingsDocument['progPointRoles'],
): Encounter[] {
  return Object.entries(progPointRoles ?? {}).reduce<Encounter[]>(
    (acc, [encounter, mapping]) => {
      if (Object.keys(mapping ?? {}).length > 0) {
        acc.push(encounter as Encounter);
      }
      return acc;
    },
    [],
  );
}

export function createNavRow(active: SettingsViewSection) {
  const buttons: [SettingsViewSection, string, string][] = [
    ['overview', SETTINGS_VIEW_OVERVIEW_BUTTON_ID, 'Overview'],
    [
      'encounterRoles',
      SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
      'Encounter Roles',
    ],
    [
      'progPointRoles',
      SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
      'Prog Point Roles',
    ],
  ];

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    buttons.map(([section, customId, label]) =>
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(
          section === active ? ButtonStyle.Primary : ButtonStyle.Secondary,
        )
        .setDisabled(section === active),
    ),
  );
}

export function createEncounterSelectRow(
  configuredEncounters: Encounter[],
  selected?: Encounter,
) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(SETTINGS_VIEW_ENCOUNTER_SELECT_ID)
    .setPlaceholder('Select an encounter')
    .addOptions(
      configuredEncounters.map((encounter) => ({
        label: EncounterFriendlyDescription[encounter],
        value: encounter,
        default: encounter === selected,
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function countConfiguredRoles(
  roleSettings: Record<string, string | undefined> | undefined,
): number {
  return Object.values(roleSettings ?? {}).filter(Boolean).length;
}

function summarizeEncounterCount(count: number): string {
  if (count === 0) {
    return 'None configured';
  }
  return count === 1
    ? '1 encounter configured'
    : `${count} encounters configured`;
}

export function buildOverviewEmbed(
  settings: SettingsDocument,
  spreadsheetFields: APIEmbedField[],
): EmbedBuilder {
  const {
    autoModChannelId,
    clearRoles,
    progPointRoles,
    progRoles,
    reviewChannel,
    reviewerRole,
    signupChannel,
    turboProgActive,
  } = settings;

  const progPointEncounters = getConfiguredProgPointEncounters(progPointRoles);
  const progPointCount = Object.values(progPointRoles ?? {}).reduce<number>(
    (sum, mapping) => sum + Object.keys(mapping ?? {}).length,
    0,
  );

  const fields: APIEmbedField[] = [
    {
      name: 'Auto-Moderation Channel',
      value: formatChannel(autoModChannelId),
      inline: true,
    },
    {
      name: 'Review Channel',
      value: formatChannel(reviewChannel),
      inline: true,
    },
    {
      name: 'Signup Channel',
      value: formatChannel(signupChannel),
      inline: true,
    },
    {
      name: 'Reviewer Role',
      value: formatRole(reviewerRole),
      inline: true,
    },
    {
      name: 'Turbo Prog Active',
      value: turboProgActive ? 'Yes' : 'No',
      inline: true,
    },
    ...spreadsheetFields,
    {
      name: 'Prog Roles',
      value: summarizeEncounterCount(countConfiguredRoles(progRoles)),
      inline: true,
    },
    {
      name: 'Clear Roles',
      value: summarizeEncounterCount(countConfiguredRoles(clearRoles)),
      inline: true,
    },
    {
      name: 'Prog Point Roles',
      value: progPointEncounters.length
        ? `${summarizeEncounterCount(progPointEncounters.length)} (${progPointCount} prog points)`
        : 'None configured',
      inline: true,
    },
  ];

  return new EmbedBuilder()
    .setTitle('Settings')
    .setDescription(
      'Ulti-Project Bot Settings — use the buttons below to view role mappings',
    )
    .addFields(fields);
}

export function buildEncounterRolesEmbed(
  settings: SettingsDocument,
): EmbedBuilder {
  const progRoleLines = reduceRoleSettings(settings.progRoles);
  const clearRoleLines = reduceRoleSettings(settings.clearRoles);

  return new EmbedBuilder().setTitle('Settings — Encounter Roles').addFields(
    {
      name: 'Prog Roles',
      value: progRoleLines.length
        ? buildTruncatedList(progRoleLines, EMBED_FIELD_VALUE_LIMIT)
        : 'No roles set',
      inline: true,
    },
    {
      name: 'Clear Roles',
      value: clearRoleLines.length
        ? buildTruncatedList(clearRoleLines, EMBED_FIELD_VALUE_LIMIT)
        : 'No roles set',
      inline: true,
    },
  );
}

export function buildProgPointRolesEmbed(
  settings: SettingsDocument,
  encounter?: Encounter,
): EmbedBuilder {
  const configuredEncounters = getConfiguredProgPointEncounters(
    settings.progPointRoles,
  );

  if (configuredEncounters.length === 0) {
    return new EmbedBuilder()
      .setTitle('Settings — Prog Point Roles')
      .setDescription('No prog point roles configured.');
  }

  if (!encounter) {
    return new EmbedBuilder()
      .setTitle('Settings — Prog Point Roles')
      .setDescription(
        'Select an encounter below to view its prog point role mappings.',
      );
  }

  const lines = Object.entries(settings.progPointRoles?.[encounter] ?? {}).map(
    ([progPoint, roleId]) => `**${progPoint}:** ${roleMention(roleId)}`,
  );

  return new EmbedBuilder()
    .setTitle(`Settings — Prog Point Roles — ${encounter}`)
    .setDescription(
      lines.length
        ? buildTruncatedList(lines, EMBED_DESCRIPTION_LIMIT)
        : 'No prog point roles set for this encounter.',
    );
}
