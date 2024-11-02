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
    .setRequired(false)
    .setName('user')
    .setDescription('The discord user to shadowban');

const discordIdOption = (option: SlashCommandStringOption) =>
  option
    .setRequired(false)
    .setName('discord-id')
    .setDescription(
      'The discord userId to shadowban. Use this if they are not part of the server yet',
    );

const characterOption = (option: SlashCommandStringOption) =>
  option
    .setRequired(false)
    .setName('character')
    .setDescription('The character name incase no discord id is known');

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
  .addStringOption(discordIdOption)
  .addStringOption(characterOption)
  .addIntegerOption(lodestoneIdOption);

const BlacklistRemoveSubCommand = new SlashCommandSubcommandBuilder()
  .setName('remove')
  .setDescription('Remove a user from the blacklist')
  .addUserOption(userOption)
  .addStringOption(discordIdOption)
  .addStringOption(characterOption)
  .addIntegerOption(lodestoneIdOption);

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
