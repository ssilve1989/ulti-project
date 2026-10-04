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
        (sum, result) => sum + result.unremovable,
        0,
      ),
      processedRoles,
    };
  }

  private processRole({
    role,
    toRemove,
    unremovable,
  }: RoleRemovalPlan): DryRunRoleResult {
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
    );

    for (const member of toRemove) {
      this.logger.log(
        `[DRY-RUN] Would remove role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    }

    return {
      roleId: role.id,
      roleName: role.name,
      membersProcessed: role.members.size,
      rolesRemoved: toRemove.length,
      unremovable: unremovable.length,
      membersToRemove: toRemove.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        username: member.user.username,
      })),
    };
  }
}
