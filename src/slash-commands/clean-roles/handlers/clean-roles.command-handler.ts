import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  EmbedBuilder,
  type Guild,
  MessageFlags,
  userMention,
} from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SignupStatus } from '../../../firebase/models/signup.model.js';
import type {
  BaseRoleResult,
  CleanRolesResult,
  DryRunResult,
  NormalResult,
  ProcessingContext,
  ProcessingStrategy,
} from '../clean-roles.interfaces.js';
import { CleanRolesCommand } from '../commands/clean-roles.command.js';
import { DryRunStrategy } from '../dry-run.strategy.js';
import { NormalStrategy } from '../normal.strategy.js';

@CommandHandler(CleanRolesCommand)
class CleanRolesCommandHandler implements ICommandHandler<CleanRolesCommand> {
  private readonly logger = new Logger(CleanRolesCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: CleanRolesCommand) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { guildId, options } = interaction;
      const isDryRun = options.getBoolean('dry-run') ?? false;

      // Add command-specific context
      Sentry.setContext('clean_roles_operation', {
        isDryRun,
      });

      this.logger.log(
        `Starting clean-roles operation for guild ${guildId} (dry-run: ${isDryRun})`,
      );

      if (isDryRun) {
        const result = await this.processCleanRolesCore(guildId, true);

        // Add context about dry run results
        Sentry.setContext('dry_run_results', {
          totalRolesProcessed: result.totalRolesProcessed,
          totalMembersProcessed: result.totalMembersProcessed,
          totalRolesRemoved: result.totalRolesRemoved,
          uniqueMembersWithRoles: result.uniqueMembersWithRoles,
        });

        const embed = this.createDryRunEmbed(result);
        await interaction.editReply({ embeds: [embed] });
        this.logger.log(
          `Clean-roles dry-run completed for guild ${guildId}: ${result.totalRolesRemoved}/${result.totalMembersProcessed} roles would be removed across ${result.totalRolesProcessed} roles`,
        );
      } else {
        const result = await this.processCleanRolesCore(guildId, false);

        // Add context about operation results
        Sentry.setContext('operation_results', {
          totalRolesProcessed: result.totalRolesProcessed,
          totalMembersProcessed: result.totalMembersProcessed,
          totalRolesRemoved: result.totalRolesRemoved,
        });

        const summary = this.createSummaryMessage(result);
        await interaction.editReply(summary);
        this.logger.log(
          `Clean-roles operation completed for guild ${guildId}: ${result.totalRolesRemoved}/${result.totalMembersProcessed} roles removed across ${result.totalRolesProcessed} roles`,
        );
      }
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private processCleanRolesCore(
    guildId: string,
    isDryRun: true,
  ): Promise<DryRunResult>;
  private processCleanRolesCore(
    guildId: string,
    isDryRun: false,
  ): Promise<NormalResult>;
  private async processCleanRolesCore(
    guildId: string,
    isDryRun: boolean,
  ): Promise<CleanRolesResult> {
    const context = await this.prepareProcessingContext(guildId);

    if (isDryRun) {
      const strategy = new DryRunStrategy(this.logger);
      const processedRoles = await this.processAllRoles(context, strategy);
      return strategy.createResult(context, processedRoles);
    }

    const strategy = new NormalStrategy(this.logger);
    const processedRoles = await this.processAllRoles(context, strategy);
    return strategy.createResult(context, processedRoles);
  }

  private async prepareProcessingContext(
    guildId: string,
  ): Promise<ProcessingContext> {
    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.progRoles && !settings?.clearRoles) {
      throw new Error(
        'No clear/prog roles configured in settings. Use `/settings roles` to configure roles first.',
      );
    }

    const allRoleIds = new Set([
      ...Object.values(settings.progRoles || {}),
      ...Object.values(settings.clearRoles || {}),
    ]);

    if (allRoleIds.size === 0) {
      throw new Error('No clear/prog roles found in settings to clean.');
    }

    const guild = await this.discordService.client.guilds.fetch(guildId);
    await guild.members.fetch();

    const activeSignups = await this.signupCollection.findByStatusIn([
      SignupStatus.APPROVED,
      SignupStatus.UPDATE_PENDING,
    ]);

    const activeSignupDiscordIds = new Set(
      activeSignups.map((signup) => signup.discordId),
    );

    this.logger.log(
      `Found ${activeSignups.length} active signups for ${activeSignupDiscordIds.size} unique Discord users`,
    );

    const allMembersWithRoles = await this.collectMembersWithRoles(
      guild,
      allRoleIds,
    );

    return {
      guild,
      guildId,
      allRoleIds,
      activeSignups,
      activeSignupDiscordIds,
      allMembersWithRoles,
    };
  }

  private async processAllRoles<T extends BaseRoleResult>(
    context: ProcessingContext,
    strategy: ProcessingStrategy<T>,
  ): Promise<T[]> {
    const results: T[] = [];

    for (const roleId of context.allRoleIds) {
      try {
        const role = await context.guild.roles.fetch(roleId);
        if (!role) {
          this.logger.warn(
            `Role ${roleId} not found in guild ${context.guildId}`,
          );
          continue;
        }

        const roleResult = await strategy.processRole(
          role,
          context.activeSignupDiscordIds,
        );
        results.push(roleResult);

        this.logger.log(
          `Completed processing role ${role.name}: ${roleResult.rolesRemoved}/${roleResult.membersProcessed} roles ${roleResult.rolesRemoved > 0 ? 'processed' : 'processed'}`,
        );
      } catch (error) {
        this.errorService.captureError(error, {
          message: `Failed to process role ${roleId}`,
        });
      }
    }

    return results;
  }

  private async collectMembersWithRoles(
    guild: Guild,
    allRoleIds: Set<string>,
  ): Promise<Set<string>> {
    const allMembersWithRoles = new Set<string>();
    for (const roleId of allRoleIds) {
      const role = await guild.roles.fetch(roleId);
      if (role) {
        for (const member of role.members.values()) {
          allMembersWithRoles.add(member.id);
        }
      }
    }
    return allMembersWithRoles;
  }

  private createSummaryMessage(result: NormalResult): string {
    const lines = [
      '## Clean Roles Summary',
      '',
      `**Total Roles Processed:** ${result.totalRolesProcessed}`,
      `**Total Members Processed:** ${result.totalMembersProcessed}`,
      `**Total Roles Removed:** ${result.totalRolesRemoved}`,
    ];

    if (result.processedRoles.length > 0) {
      lines.push('', '**Role Details:**');
      for (const roleInfo of result.processedRoles) {
        if (roleInfo.rolesRemoved > 0) {
          lines.push(
            `• **${roleInfo.roleName}**: ${roleInfo.rolesRemoved}/${roleInfo.membersProcessed} removed`,
          );
        } else if (roleInfo.membersProcessed > 0) {
          lines.push(
            `• **${roleInfo.roleName}**: 0/${roleInfo.membersProcessed} removed (all have active signups)`,
          );
        } else {
          lines.push(`• **${roleInfo.roleName}**: No members had this role`);
        }
      }
    }

    if (result.totalRolesRemoved === 0) {
      lines.push(
        '',
        '✅ All members with clear/prog roles have active signups!',
      );
    } else {
      lines.push('', '✅ Role cleanup completed successfully!');
    }

    return lines.join('\n');
  }

  private createDryRunEmbed(result: DryRunResult): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🔍 Clean Roles - Dry Run Preview')
      .setColor(0x3498db)
      .addFields(
        {
          name: '📊 Processing Summary',
          value: [
            `**Roles Processed:** ${result.totalRolesProcessed}`,
            `**Role Assignments Processed:** ${result.totalMembersProcessed}`,
            `**Role Assignments to Remove:** ${result.totalRolesRemoved}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '👥 Member Analysis',
          value: [
            `**Total Active Signups:** ${result.totalActiveSignups}`,
            `**Members with Roles (Before):** ${result.uniqueMembersWithRoles}`,
            `**Members with Roles (After):** ${result.uniqueMembersAfterRemoval}`,
            `**Members to Lose Roles:** ${result.uniqueMembersWithRoles - result.uniqueMembersAfterRemoval}`,
          ].join('\n'),
          inline: false,
        },
      );

    // Add validation section
    const isValidCount =
      result.uniqueMembersAfterRemoval <= result.totalActiveSignups;
    const validationIcon = isValidCount ? '✅' : '⚠️';
    const validationStatus = isValidCount
      ? 'Expected: Members after removal should match or be less than active signups'
      : 'Warning: Members after removal exceeds active signups - this may indicate an issue';

    embed.addFields({
      name: `${validationIcon} Validation Check`,
      value: [
        validationStatus,
        '**Expected Result:** Members with roles after cleanup ≤ Active signups',
        `**Actual Result:** ${result.uniqueMembersAfterRemoval} ≤ ${result.totalActiveSignups} = ${isValidCount ? 'PASS' : 'FAIL'}`,
      ].join('\n'),
      inline: false,
    });

    // Add fields for each role with members to remove
    const rolesWithRemovals = result.processedRoles.filter(
      (role) => role.rolesRemoved > 0,
    );

    if (rolesWithRemovals.length === 0) {
      embed.addFields({
        name: '✅ No Changes Required',
        value: 'All members with clear/prog roles have active signups!',
        inline: false,
      });
    } else {
      for (const roleInfo of rolesWithRemovals.slice(0, 25)) {
        // Discord embed limit
        const members = roleInfo.membersToRemove || [];
        const memberList = members
          .slice(0, 10) // Limit to 10 members per role to avoid embed size limits
          .map(
            (member) => `• ${userMention(member.id)} (${member.displayName})`,
          )
          .join('\n');

        const moreCount = members.length - 10;
        const fieldValue =
          memberList + (moreCount > 0 ? `\n... and ${moreCount} more` : '');

        embed.addFields({
          name: `🎭 ${roleInfo.roleName} (${roleInfo.rolesRemoved} removals)`,
          value: fieldValue || 'No members to remove',
          inline: false,
        });
      }

      if (rolesWithRemovals.length > 25) {
        embed.addFields({
          name: '⚠️ Additional Roles',
          value: `... and ${rolesWithRemovals.length - 25} more roles with changes`,
          inline: false,
        });
      }
    }

    embed.setFooter({
      text: '💡 Run without --dry-run to execute these changes',
    });

    return embed;
  }
}

export { CleanRolesCommandHandler };
