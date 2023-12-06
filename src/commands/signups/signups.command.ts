import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DiscordCommand } from '../commands.interfaces.js';

const SignupCommandData = new SlashCommandBuilder()
  .setName('signup')
  .setDescription('Signup for an ultimate prog/clear party!');

class SignupCommand implements DiscordCommand {
  public static readonly NAME = 'signup';

  constructor(public readonly interaction: ChatInputCommandInteraction) {}
}

export { SignupCommand, SignupCommandData };
