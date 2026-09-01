import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandIntegerOption,
  type SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  type SlashCommandUserOption,
} from 'discord.js';

const userOption = (option: SlashCommandUserOption) =>
  option
    .setRequired(true)
    .setName('user')
    .setDescription('The discord user to shadowban');

const characterOption = (option: SlashCommandStringOption) =>
  option
    .setName('character')
    .setDescription(
      'Overrides the character name inferred by the Discord User',
    );

const lodestoneIdOption = (option: SlashCommandIntegerOption) =>
  option
    .setName('lodestone-id')
    .setDescription('The Lodestone ID of the character');

const BlacklistAddSubCommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('A list of players to keep an eye on')
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('The reason for the shadowban')
      .setRequired(true),
  )
  .addUserOption(userOption)
  .addStringOption(characterOption)
  .addIntegerOption(lodestoneIdOption);

const BlacklistRemoveSubCommand = new SlashCommandSubcommandBuilder()
  .setName('remove')
  .setDescription('Remove a user from the blacklist')
  .addUserOption(userOption);

const BlacklistDisplayCommand = new SlashCommandSubcommandBuilder()
  .setName('display')
  .setDescription('Display the current blacklist');

export const BlacklistSlashCommand = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Manage the blacklist')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(BlacklistAddSubCommand)
  .addSubcommand(BlacklistRemoveSubCommand)
  .addSubcommand(BlacklistDisplayCommand);
