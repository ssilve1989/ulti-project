import type { Logger } from '@nestjs/common';
import type {
  DryRunResult,
  DryRunRoleResult,
  ProcessingContext,
  ProcessingStrategy,
  RoleRemovalPlan,
} from './clean-roles.interfaces.js';
import { summarizeProcessedRoles } from './clean-roles.utils.js';

export class DryRunStrategy implements ProcessingStrategy<DryRunRoleResult> {
  constructor(private readonly logger: Logger) {}

  processRoles(plans: RoleRemovalPlan[]): Promise<DryRunRoleResult[]> {
    return Promise.resolve(plans.map((plan) => this.processRole(plan)));
  }

  createResult(
    context: ProcessingContext,
    processedRoles: DryRunRoleResult[],
  ): DryRunResult {
    return {
      isDryRun: true,
      ...summarizeProcessedRoles(context, processedRoles),
      totalUnremovable: processedRoles.reduce(
        (sum, result) => sum + (result.removable ? 0 : result.unremovable),
        0,
      ),
      processedRoles,
    };
  }

  private processRole({
    role,
    kept,
    stale,
    removable,
  }: RoleRemovalPlan): DryRunRoleResult {
    const membersProcessed = kept.length + stale.length;
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${membersProcessed} members`,
    );

    const base = { roleId: role.id, roleName: role.name, membersProcessed };
    if (!removable) {
      return { ...base, rolesRemoved: 0, removable, unremovable: stale.length };
    }

    for (const member of stale) {
      this.logger.log(
        `[DRY-RUN] Would remove role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    }

    return {
      ...base,
      rolesRemoved: stale.length,
      removable,
      membersToRemove: stale.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        username: member.user.username,
      })),
    };
  }
}
