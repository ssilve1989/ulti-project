import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  Colors,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';
import { ErrorService } from '../../../error/error.service.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { SlashCommandRegistry } from '../../slash-command-registry.service.js';
import { HelpSlashCommand } from '../help.slash-command.js';
import {
  type CommandInfo,
  filterCommandsByPermissions,
  getAvailableCommands,
} from '../help.utils.js';

@Injectable()
@SlashCommand({ builder: HelpSlashCommand })
class HelpCommandHandler implements ISlashCommand {
  private registry!: SlashCommandRegistry;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly errorService: ErrorService,
  ) {}

  private getRegistry(): SlashCommandRegistry {
    if (!this.registry) {
      this.registry = this.moduleRef.get(SlashCommandRegistry, {
        strict: false,
      });
    }
    return this.registry;
  }

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    scope.setContext('help_command', {
      hasAdminPerms:
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator,
        ) ?? false,
      hasManageGuildPerms:
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild,
        ) ?? false,
    });

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const isAdmin =
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator,
        ) ?? false;
      const canManageGuild =
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild,
        ) ?? false;

      const allCommands = getAvailableCommands(
        this.getRegistry().getAllBuilders(),
      );
      const availableCommands = filterCommandsByPermissions(
        allCommands,
        isAdmin,
        canManageGuild,
      );

      scope.setContext('help_processing', {
        totalCommands: allCommands.length,
        availableCommands: availableCommands.length,
      });

      const embed = this.createHelpEmbed(
        availableCommands,
        isAdmin,
        canManageGuild,
      );
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
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
