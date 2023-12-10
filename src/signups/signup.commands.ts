import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../commands/commands.interfaces.js';
import { Signup } from './signup.interfaces.js';

export class SignupCommand implements DiscordCommand {
  public static readonly NAME = 'signup';
  constructor(public readonly interaction: ChatInputCommandInteraction) {}
}

export class SendSignupReviewCommand {
  constructor(public readonly signup: Signup) {}
}

export class UpdateSignupReviewCommand {
  constructor(
    public readonly signup: Signup,
    public readonly messageId: string,
  ) {}
}
