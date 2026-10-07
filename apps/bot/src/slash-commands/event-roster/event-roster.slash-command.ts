import { getEncounterChoicesForMode } from '@ulti-project/shared';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../config/app.js';

export function createEventRosterSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setName('event-roster')
    .setDescription("List a raid-helper event's sign-ups by prog point")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('event')
        .setDescription('The raid-helper event ID (the event message ID)')
        .setMaxLength(32)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('encounter')
        .setDescription('The encounter whose signups to match')
        .setRequired(true)
        .addChoices(...getEncounterChoicesForMode(mode)),
    )
    .addStringOption((option) =>
      option
        .setName('format')
        .setDescription(
          'A table per prog point (default), or a list with mentions',
        )
        .addChoices(
          { name: 'Table', value: 'table' },
          { name: 'List', value: 'list' },
        ),
    );
}
