import { ChatInputCommandInteraction } from 'discord.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import type { DiscordCommand } from '../../../slash-commands/slash-commands.interfaces.js';

export class SignupCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}

// TODO: Extract into a role manager module with the other role related side-effects?
export class RemoveRolesCommand {
  constructor(
    public readonly guildId: string,
    public readonly userId: string,
    public readonly encounter: Encounter,
  ) {}
}
