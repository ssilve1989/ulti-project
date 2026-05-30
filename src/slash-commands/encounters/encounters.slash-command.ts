import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';

export const ViewEncounterSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('View the configuration of an encounter')
  .addStringOption((option) =>
    option
      .setName('encounter')
      .setDescription(
        'The encounter to view (optional, shows all if not specified)',
      )
      .setRequired(false)
      .addChoices(
        ...Object.entries(Encounter).map(([name, value]) => ({
          name,
          value,
        })),
      ),
  );

export const EncountersSlashCommand = new SlashCommandBuilder()
  .setName('encounters')
  .setDescription('View encounter configuration')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(ViewEncounterSubcommand);
