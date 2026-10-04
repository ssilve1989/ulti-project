import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { SignupStatus } from '@ulti-project/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  EmbedBuilder,
  embedLength,
  type Guild,
  type GuildMember,
  MessageFlags,
  type Role,
  userMention,
} from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import type {
  BaseRoleResult,
  CleanRolesResult,
  DryRunResult,
  DryRunRoleResult,
  NormalResult,
  NormalRoleResult,
  ProcessingContext,
  ProcessingStrategy,
} from '../clean-roles.interfaces.js';
import { CleanRolesSlashCommand } from '../clean-roles.slash-command.js';
import { planRoleRemovals } from '../clean-roles.utils.js';
import { DryRunStrategy } from '../dry-run.strategy.js';
import { NormalStrategy } from '../normal.strategy.js';

const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_TOTAL_LENGTH = 6000;
const MAX_EMBED_FIELD_VALUE_LENGTH = 1024;

function additionalRolesField(count: number) {
  return {
    name: '⚠️ Additional Roles',
    value: `… and ${count} more roles with changes`,
    inline: false,
  };
}

function dryRunRoleField(roleInfo: DryRunRoleResult) {
  // a role is either removable from all its holders or from none of them
  if (roleInfo.unremovable > 0) {
    return {
      name: `⚠️ ${roleInfo.roleName} (${roleInfo.unremovable} can't be removed)`,
      value:
        "The bot can't remove this role: it's managed, above the bot's highest role, or the bot lacks Manage Roles.",
      inline: false,
    };
  }

  const members = roleInfo.membersToRemove;
  const memberList = members
    .slice(0, 10) // Limit to 10 members per role to avoid embed size limits
    .map((member) => `• ${userMention(member.id)} (${member.displayName})`)
    .join('\n');

  const moreCount = members.length - 10;
  const value =
    memberList + (moreCount > 0 ? `\n... and ${moreCount} more` : '');
  const fieldValue =
    value.length <= MAX_EMBED_FIELD_VALUE_LENGTH
      ? value
      : `${value.slice(0, MAX_EMBED_FIELD_VALUE_LENGTH - 1)}…`;

  return {
    name: `🎭 ${roleInfo.roleName} (${roleInfo.rolesRemoved} removals)`,
    value: fieldValue,
    inline: false,
  };
}

function addDryRunRoleFields(
  embed: EmbedBuilder,
  processedRoles: DryRunResult['processedRoles'],
): void {
  const rolesWithChanges = processedRoles.filter(
    (role) => role.rolesRemoved > 0 || role.unremovable > 0,
  );

  if (rolesWithChanges.length === 0) {
    embed.addFields({
      name: '✅ No Changes Required',
      value: 'All members with clear/prog roles have active signups!',
      inline: false,
    });
    return;
  }

  const availableFields = MAX_EMBED_FIELDS - (embed.data.fields?.length ?? 0);
  const hasAdditionalRoles = rolesWithChanges.length > availableFields;
  const roleFieldLimit = hasAdditionalRoles
    ? availableFields - 1
    : availableFields;

  let addedRoleCount = 0;
  for (const roleInfo of rolesWithChanges.slice(0, roleFieldLimit)) {
    const field = dryRunRoleField(roleInfo);
    const omittedRoleCount = rolesWithChanges.length - addedRoleCount;
    const additionalField = additionalRolesField(omittedRoleCount);
    const reservedLength =
      hasAdditionalRoles || omittedRoleCount > 1
        ? additionalField.name.length + additionalField.value.length
        : 0;

    if (
      embedLength(embed.data) +
        field.name.length +
        field.value.length +
        reservedLength >
      MAX_EMBED_TOTAL_LENGTH
    ) {
      break;
    }

    embed.addFields(field);
    addedRoleCount++;
  }

  const additionalRoleCount = rolesWithChanges.length - addedRoleCount;
  if (additionalRoleCount > 0) {
    embed.addFields(additionalRolesField(additionalRoleCount));
  }
}

@Injectable()
@SlashCommand({ builder: CleanRolesSlashCommand })
class CleanRolesCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(CleanRolesCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(interaction: ChatInputCommandInteraction<'cached'>) {
    try {
      const scope = Sentry.getCurrentScope();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { guildId, options } = interaction;
      const isDryRun = options.getBoolean('dry-run') ?? false;

      // Add command-specific context
      scope.setContext('clean_roles_operation', {
        isDryRun,
      });

      this.logger.log(
        `Starting clean-roles operation for guild ${guildId} (dry-run: ${isDryRun})`,
      );

      if (isDryRun) {
        const result = await this.processCleanRolesCore(guildId, true);

        // Add context about dry run results
        scope.setContext('dry_run_results', {
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
        scope.setContext('operation_results', {
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

    if (
      !settings?.progRoles &&
      !settings?.clearRoles &&
      !settings?.progPointRoles
    ) {
      throw new Error(
        'No clear/prog roles configured in settings. Use `/settings roles` to configure roles first.',
      );
    }

    const allRoleIds = new Set([
      ...Object.values(settings.progRoles || {}),
      ...Object.values(settings.clearRoles || {}),
      ...Object.values(settings.progPointRoles || {}).flatMap((mapping) =>
        Object.values(mapping ?? {}),
      ),
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

    const plans = planRoleRemovals(
      this.resolveRoles(guild, allRoleIds),
      activeSignupDiscordIds,
    );
    const memberIds = (members: GuildMember[]) =>
      new Set(members.map(({ id }) => id));

    return {
      plans,
      activeSignups,
      allMembersWithRoles: memberIds(
        plans.flatMap(({ kept, toRemove, unremovable }) => [
          ...kept,
          ...toRemove,
          ...unremovable,
        ]),
      ),
      membersKeepingRoles: memberIds(
        plans.flatMap(({ kept, unremovable }) => [...kept, ...unremovable]),
      ),
    };
  }

  private async processAllRoles<T extends BaseRoleResult>(
    context: ProcessingContext,
    strategy: ProcessingStrategy<T>,
  ): Promise<T[]> {
    const results = await strategy.processRoles(context.plans);

    for (const roleResult of results) {
      this.logger.log(
        `Completed processing role ${roleResult.roleName}: ${roleResult.rolesRemoved}/${roleResult.membersProcessed} roles processed`,
      );
    }

    return results;
  }

  /**
   * The configured roles, from the role cache the Guilds intent keeps current,
   * so no REST call is made and a deleted role is simply absent.
   */
  private resolveRoles(guild: Guild, allRoleIds: Set<string>): Role[] {
    const roles: Role[] = [];
    for (const roleId of allRoleIds) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        roles.push(role);
      } else {
        this.logger.warn(`Role ${roleId} not found in guild ${guild.id}`);
      }
    }
    return roles;
  }

  private createSummaryMessage(result: NormalResult): string {
    const lines = [
      '## Clean Roles Summary',
      '',
      `**Total Roles Processed:** ${result.totalRolesProcessed}`,
      `**Total Members Processed:** ${result.totalMembersProcessed}`,
      `**Total Roles Removed:** ${result.totalRolesRemoved}`,
      `**Failed Removals:** ${result.totalFailedRemovals}`,
    ];

    if (result.processedRoles.length > 0) {
      lines.push('', '**Role Details:**');
      for (const roleInfo of result.processedRoles) {
        lines.push(this.formatRoleSummary(roleInfo));
      }
    }

    lines.push('', this.formatCleanupOutcome(result));
    return lines.join('\n');
  }

  private formatRoleSummary(roleInfo: NormalRoleResult): string {
    const failed = roleInfo.failedRemovals;
    const skipped = roleInfo.skippedActiveSignups;
    if (roleInfo.rolesRemoved > 0 || failed > 0) {
      const details = [
        ...(failed > 0 ? [`${failed} failed`] : []),
        ...(skipped > 0 ? [`${skipped} kept for active signups`] : []),
      ];
      const outcome = `${roleInfo.rolesRemoved}/${roleInfo.membersProcessed} removed`;
      return `• **${roleInfo.roleName}**: ${outcome}${details.length ? ` (${details.join(', ')})` : ''}`;
    }
    if (roleInfo.membersProcessed > 0) {
      return `• **${roleInfo.roleName}**: 0/${roleInfo.membersProcessed} removed (${skipped} kept for active signups)`;
    }
    return `• **${roleInfo.roleName}**: No members had this role`;
  }

  private formatCleanupOutcome(result: NormalResult): string {
    if (result.totalFailedRemovals > 0) {
      return '⚠️ Role cleanup completed with failed removals.';
    }
    return result.totalRolesRemoved === 0
      ? '✅ No role removals were needed; members with active signups kept their roles.'
      : '✅ Role cleanup completed successfully!';
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
            ...(result.totalUnremovable > 0
              ? [
                  `**Role Assignments That Can't Be Removed:** ${result.totalUnremovable}`,
                ]
              : []),
          ].join('\n'),
          inline: false,
        },
        {
          name: '👥 Member Analysis',
          value: [
            `**Total Active Signups:** ${result.totalActiveSignups}`,
            `**Members with Roles (Before):** ${result.uniqueMembersWithRoles}`,
            `**Members with Roles (After):** ${result.uniqueMembersAfterRemoval}`,
            `**Members Losing All Roles:** ${result.uniqueMembersWithRoles - result.uniqueMembersAfterRemoval}`,
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

    embed.setFooter({
      text: '💡 Run without --dry-run to execute these changes',
    });

    addDryRunRoleFields(embed, result.processedRoles);

    return embed;
  }
}

export { CleanRolesCommandHandler };
