import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  Colors,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';
import {
  SLASH_COMMANDS_TOKEN,
  type SlashCommands,
} from '../slash-commands.provider.js';
import { HelpCommand } from './help.command.js';
import {
  type CommandInfo,
  filterCommandsByPermissions,
  getAvailableCommands,
} from './help.utils.js';

@CommandHandler(HelpCommand)
class HelpCommandHandler implements ICommandHandler<HelpCommand> {
  constructor(
    @Inject(SLASH_COMMANDS_TOKEN) private readonly slashCommands: SlashCommands,
  ) {}

  @SentryTraced()
  async execute({ interaction }: HelpCommand): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const isAdmin =
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      ) ?? false;
    const canManageGuild =
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.ManageGuild,
      ) ?? false;

    const allCommands = getAvailableCommands(this.slashCommands);
    const availableCommands = filterCommandsByPermissions(
      allCommands,
      isAdmin,
      canManageGuild,
    );

    const embed = this.createHelpEmbed(
      availableCommands,
      isAdmin,
      canManageGuild,
    );

    await interaction.editReply({ embeds: [embed] });
  }

  private createHelpEmbed(
    commands: CommandInfo[],
    isAdmin: boolean,
    canManageGuild: boolean,
  ): EmbedBuilder {
    const { publicCommands, manageGuildCommands, adminCommands } =
      commands.reduce(
        (acc, cmd) => {
          if (cmd.permissionLevel === 'public') {
            acc.publicCommands.push(cmd);
          } else if (cmd.permissionLevel === 'manageGuild') {
            acc.manageGuildCommands.push(cmd);
          } else if (cmd.permissionLevel === 'administrator') {
            acc.adminCommands.push(cmd);
          }
          return acc;
        },
        {
          publicCommands: [] as CommandInfo[],
          manageGuildCommands: [] as CommandInfo[],
          adminCommands: [] as CommandInfo[],
        },
      );

    const embed = new EmbedBuilder()
      .setTitle('📚 Bot Commands Help')
      .setDescription('Here are the commands available to you:')
      .setColor(Colors.Blue)
      .setTimestamp();

    // Always add public commands
    if (publicCommands.length > 0) {
      const publicCommandsText = publicCommands
        .map((cmd) => this.formatCommand(cmd))
        .join('\n');

      embed.addFields({
        name: '🔓 Public Commands',
        value: publicCommandsText,
        inline: false,
      });
    }

    // Add manage guild commands if user has permission
    if (manageGuildCommands.length > 0 && (canManageGuild || isAdmin)) {
      const manageGuildCommandsText = manageGuildCommands
        .map((cmd) => this.formatCommand(cmd))
        .join('\n');

      embed.addFields({
        name: '⚙️ Management Commands',
        value: manageGuildCommandsText,
        inline: false,
      });
    }

    // Add admin commands if user is admin
    if (adminCommands.length > 0 && isAdmin) {
      const adminCommandsText = adminCommands
        .map((cmd) => this.formatCommand(cmd))
        .join('\n');

      embed.addFields({
        name: '🔒 Administrator Commands',
        value: adminCommandsText,
        inline: false,
      });
    }

    // Add footer with permission info
    let footerText = `Showing ${commands.length} available commands`;
    if (isAdmin) {
      footerText += ' • You have Administrator permissions';
    } else if (canManageGuild) {
      footerText += ' • You have Manage Guild permissions';
    }

    embed.setFooter({ text: footerText });

    return embed;
  }

  private formatCommand(command: CommandInfo): string {
    let formatted = `**/${command.name}** - ${command.description}`;

    if (command.subcommands && command.subcommands.length > 0) {
      const subcommandList = command.subcommands
        .map((sub) => `\`${sub}\``)
        .join(', ');
      formatted += `\n└ Subcommands: ${subcommandList}`;
    }

    return formatted;
  }
}

export { HelpCommandHandler };
