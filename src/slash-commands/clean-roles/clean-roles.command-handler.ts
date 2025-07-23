import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
  MessageFlags,
  type Role,
  userMention,
} from 'discord.js';
import { from, lastValueFrom, map, mergeMap } from 'rxjs';
import { DiscordService } from '../../discord/discord.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SignupStatus } from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { CleanRolesCommand } from './clean-roles.command.js';

interface MemberToRemove {
  id: string;
  displayName: string;
  username: string;
}

interface BaseRoleResult {
  roleId: string;
  roleName: string;
  membersProcessed: number;
  rolesRemoved: number;
}

interface DryRunRoleResult extends BaseRoleResult {
  membersToRemove: MemberToRemove[];
}

interface NormalRoleResult extends BaseRoleResult {
  // No additional properties needed for normal execution
}

interface BaseCleanRolesResult {
  totalRolesProcessed: number;
  totalMembersProcessed: number;
  totalRolesRemoved: number;
  totalActiveSignups: number;
  uniqueMembersWithRoles: number;
  uniqueMembersAfterRemoval: number;
}

interface DryRunResult extends BaseCleanRolesResult {
  isDryRun: true;
  processedRoles: DryRunRoleResult[];
}

interface NormalResult extends BaseCleanRolesResult {
  isDryRun: false;
  processedRoles: NormalRoleResult[];
}

type CleanRolesResult = DryRunResult | NormalResult;

@CommandHandler(CleanRolesCommand)
class CleanRolesCommandHandler implements ICommandHandler<CleanRolesCommand> {
  private readonly logger = new Logger(CleanRolesCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
  ) {}

  @SentryTraced()
  async execute({ interaction }: CleanRolesCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { guildId, options } = interaction;
      const isDryRun = options.getBoolean('dry-run') ?? false;

      this.logger.log(
        `Starting clean-roles operation for guild ${guildId} (dry-run: ${isDryRun})`,
      );

      if (isDryRun) {
        const result = await this.processCleanRolesCore(guildId, true);
        const embed = this.createDryRunEmbed(result);
        await interaction.editReply({ embeds: [embed] });
        this.logger.log(
          `Clean-roles dry-run completed for guild ${guildId}: ${result.totalRolesRemoved}/${result.totalMembersProcessed} roles would be removed across ${result.totalRolesProcessed} roles`,
        );
      } else {
        const result = await this.processCleanRolesCore(guildId, false);
        const summary = this.createSummaryMessage(result);
        await interaction.editReply(summary);
        this.logger.log(
          `Clean-roles operation completed for guild ${guildId}: ${result.totalRolesRemoved}/${result.totalMembersProcessed} roles removed across ${result.totalRolesProcessed} roles`,
        );
      }
    } catch (error) {
      sentryReport(error);
      this.logger.error(error);

      // Check if it's a user-facing error message
      const errorMessage =
        error instanceof Error && error.message.includes('settings')
          ? error.message
          : 'An error occurred while cleaning roles. Please try again later.';

      await interaction.editReply(errorMessage);
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
    await guild.members.fetch(); // Ensure member cache is up-to-date

    // Fetch all active signups (APPROVED and UPDATE_PENDING) in a single query
    const activeSignups = await this.signupCollection.findByStatusIn([
      SignupStatus.APPROVED,
      SignupStatus.UPDATE_PENDING,
    ]);

    // Create a Set for O(1) lookup of Discord IDs with active signups
    const activeSignupDiscordIds = new Set(
      activeSignups.map((signup) => signup.discordId),
    );

    this.logger.log(
      `Found ${activeSignups.length} active signups for ${activeSignupDiscordIds.size} unique Discord users`,
    );

    // Collect all unique members who currently have any of the roles
    const allMembersWithRoles = await this.collectMembersWithRoles(
      guild,
      allRoleIds,
    );

    const baseResult: BaseCleanRolesResult = {
      totalRolesProcessed: 0,
      totalMembersProcessed: 0,
      totalRolesRemoved: 0,
      totalActiveSignups: activeSignups.length,
      uniqueMembersWithRoles: allMembersWithRoles.size,
      uniqueMembersAfterRemoval: 0, // Will be calculated after processing
    };

    const result: CleanRolesResult = isDryRun
      ? { ...baseResult, isDryRun: true, processedRoles: [] }
      : { ...baseResult, isDryRun: false, processedRoles: [] };

    // Process each role sequentially to avoid overwhelming the system
    await this.processAllRoles(
      allRoleIds,
      guild,
      guildId,
      activeSignupDiscordIds,
      result,
    );

    // Calculate unique members who will still have roles after removal
    // These are members who currently have roles AND have active signups
    const membersWhoWillKeepRoles = new Set<string>();
    for (const memberId of allMembersWithRoles) {
      if (activeSignupDiscordIds.has(memberId)) {
        membersWhoWillKeepRoles.add(memberId);
      }
    }

    result.uniqueMembersAfterRemoval = membersWhoWillKeepRoles.size;

    return result;
  }

  private async processAllRoles(
    allRoleIds: Set<string>,
    guild: Guild,
    guildId: string,
    activeSignupDiscordIds: Set<string>,
    result: CleanRolesResult,
  ): Promise<void> {
    for (const roleId of allRoleIds) {
      try {
        const role = await guild.roles.fetch(roleId);
        if (!role) {
          this.logger.warn(`Role ${roleId} not found in guild ${guildId}`);
          continue;
        }

        if (result.isDryRun) {
          const roleResult = await this.processDryRunRoleMembers(
            role,
            activeSignupDiscordIds,
          );
          result.processedRoles.push(roleResult);
        } else {
          const roleResult = await this.processNormalRoleMembers(
            role,
            activeSignupDiscordIds,
          );
          result.processedRoles.push(roleResult);
        }
        const roleResult =
          result.processedRoles[result.processedRoles.length - 1];
        result.totalRolesProcessed++;
        result.totalMembersProcessed += roleResult.membersProcessed;
        result.totalRolesRemoved += roleResult.rolesRemoved;

        this.logger.log(
          `Completed processing role ${role.name}: ${roleResult.rolesRemoved}/${roleResult.membersProcessed} roles removed`,
        );
      } catch (error) {
        this.logger.error(`Failed to process role ${roleId}:`, error);
        sentryReport(error);
      }
    }
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

  private async processDryRunRoleMembers(
    role: Role,
    activeSignupDiscordIds: Set<string>,
  ): Promise<DryRunRoleResult> {
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
    );

    const roleResult: DryRunRoleResult = {
      roleId: role.id,
      roleName: role.name,
      membersProcessed: role.members.size,
      rolesRemoved: 0,
      membersToRemove: [],
    };

    if (role.members.size === 0) {
      return roleResult;
    }

    const memberProcessingTask$ = from(role.members.values()).pipe(
      map((member: GuildMember) => {
        this.processDryRunMember(
          member,
          role,
          activeSignupDiscordIds,
          roleResult,
        );
      }),
    );

    await lastValueFrom(memberProcessingTask$, { defaultValue: undefined });
    return roleResult;
  }

  private async processNormalRoleMembers(
    role: Role,
    activeSignupDiscordIds: Set<string>,
  ): Promise<NormalRoleResult> {
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
    );

    const roleResult: NormalRoleResult = {
      roleId: role.id,
      roleName: role.name,
      membersProcessed: role.members.size,
      rolesRemoved: 0,
    };

    if (role.members.size === 0) {
      return roleResult;
    }

    // Process members of this role with controlled concurrency
    const memberProcessingTask$ = from(role.members.values()).pipe(
      mergeMap(
        (member: GuildMember) => {
          return this.processNormalMember(
            member,
            role,
            activeSignupDiscordIds,
            roleResult,
          );
        },
        5, // Process max 5 members concurrently to avoid rate limits
      ),
    );

    await lastValueFrom(memberProcessingTask$, { defaultValue: undefined });
    return roleResult;
  }

  private processDryRunMember(
    member: GuildMember,
    role: Role,
    activeSignupDiscordIds: Set<string>,
    roleResult: DryRunRoleResult,
  ): void {
    const hasActiveSignup = activeSignupDiscordIds.has(member.id);
    if (hasActiveSignup) return;

    try {
      roleResult.membersToRemove.push({
        id: member.id,
        displayName: member.displayName,
        username: member.user.username,
      });
      roleResult.rolesRemoved++;
      this.logger.log(
        `[DRY-RUN] Would remove role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process member ${member.displayName} (${member.id}) for role ${role.name}:`,
        error,
      );
      sentryReport(error);
    }
  }

  private async processNormalMember(
    member: GuildMember,
    role: Role,
    activeSignupDiscordIds: Set<string>,
    roleResult: NormalRoleResult,
  ): Promise<void> {
    // Check if member has any active signups using in-memory lookup
    const hasActiveSignup = activeSignupDiscordIds.has(member.id);
    if (hasActiveSignup) return;

    try {
      await member.roles.remove(
        role.id,
        'Cleaned by clean-roles command - no active signups',
      );
      roleResult.rolesRemoved++;
      this.logger.log(
        `Removed role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process member ${member.displayName} (${member.id}) for role ${role.name}:`,
        error,
      );
      sentryReport(error);
    }
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
