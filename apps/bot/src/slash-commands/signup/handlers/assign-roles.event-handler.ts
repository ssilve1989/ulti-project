import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { PartyStatus } from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ProgPointRolesService } from '../../../role-manager/prog-point-roles.service.js';
import { SignupApprovedEvent } from '../events/signup.events.js';

// The party statuses this handler acts on. `Cleared` (and any status added
// later) is deliberately excluded: role removal for a cleared signup is owned
// by the cleared saga (`RemoveRolesCommandHandler`).
const ACTIVE_PARTY_STATUSES = new Set<PartyStatus>([
  PartyStatus.EarlyProgParty,
  PartyStatus.ProgParty,
  PartyStatus.ClearParty,
]);

@EventsHandler(SignupApprovedEvent)
class AssignRolesEventHandler implements IEventHandler<SignupApprovedEvent> {
  constructor(
    private readonly discordService: DiscordService,
    private readonly progPointRolesService: ProgPointRolesService,
  ) {}

  async handle(event: SignupApprovedEvent) {
    const {
      signup: { discordId, encounter, partyStatus, progPoint },
      settings: { progRoles, clearRoles, progPointRoles },
      message: { guildId },
    } = event;

    if (!partyStatus || !ACTIVE_PARTY_STATUSES.has(partyStatus)) {
      return;
    }

    const progRole = progRoles?.[encounter];
    const clearRole = clearRoles?.[encounter];
    const mapping = progPointRoles?.[encounter];

    if (!progRole && !clearRole && !mapping) {
      return;
    }

    try {
      const member = await this.discordService.getGuildMember({
        memberId: discordId,
        guildId,
      });

      if (!member) {
        return;
      }

      await this.reconcileCoarseRole(member, partyStatus, progRole, clearRole);
      await this.reconcileProgPointRole(member, progPoint, mapping);
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtra('event', event);
      scope.captureException(error);
    }
  }

  /**
   * Reconcile the member's single coarse role for this encounter against the
   * one `partyStatus` implies — `clearRole` for `ClearParty`, `progRole`
   * otherwise. A stale coarse role is stripped even when the target status has
   * no role configured; the two coarse roles are the only candidates.
   */
  private async reconcileCoarseRole(
    member: GuildMember,
    partyStatus: PartyStatus,
    progRole: string | undefined,
    clearRole: string | undefined,
  ): Promise<void> {
    const desiredRole =
      partyStatus === PartyStatus.ClearParty ? clearRole : progRole;

    const changes = this.progPointRolesService.reconcileRole(
      member,
      [progRole, clearRole],
      desiredRole,
      { pruneWhenNoDesired: true },
    );

    await this.progPointRolesService.applyChanges(member, changes);
  }

  /**
   * Reconcile the member's prog-point role against the mapped role for their
   * current prog point. An unmapped prog point maps to no role, so any held
   * mapped role for this encounter is stripped (`pruneUnmapped`).
   */
  private async reconcileProgPointRole(
    member: GuildMember,
    progPoint: string | undefined,
    mapping: Record<string, string> | undefined,
  ): Promise<void> {
    if (!mapping || !progPoint) {
      return;
    }

    const changes = this.progPointRolesService.computeChanges(
      member,
      mapping,
      progPoint,
      { pruneUnmapped: true },
    );

    await this.progPointRolesService.applyChanges(member, changes);
  }
}

export { AssignRolesEventHandler };
