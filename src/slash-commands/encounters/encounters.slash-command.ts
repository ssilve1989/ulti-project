import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';

export const SetThresholdsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('set-thresholds')
  .setDescription('Set the prog and clear party thresholds for an encounter')
  .addStringOption((option) =>
    option
      .setName('encounter')
      .setDescription('The encounter to configure')
      .setRequired(true)
      .addChoices(
        ...Object.entries(Encounter).map(([name, value]) => ({
          name,
          value,
        })),
      ),
  );

export const ManageProgPointsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('manage-prog-points')
  .setDescription('Add, edit, or remove prog points for an encounter')
  .addStringOption((option) =>
    option
      .setName('encounter')
      .setDescription('The encounter to manage prog points for')
      .setRequired(true)
      .addChoices(
        ...Object.entries(Encounter).map(([name, value]) => ({
          name,
          value,
        })),
      ),
  );

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
  .setDescription('Manage encounter prog points and thresholds')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(SetThresholdsSubcommand)
  .addSubcommand(ManageProgPointsSubcommand)
  .addSubcommand(ViewEncounterSubcommand);
