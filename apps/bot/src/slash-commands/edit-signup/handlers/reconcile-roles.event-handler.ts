import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { ProgPointRolesService } from '../../../role-manager/prog-point-roles.service.js';
import { SignupEditedEvent } from '../events/signup-edited.event.js';

/**
 * Unlike AssignRolesEventHandler (add-only), an edit may move a signup
 * backwards, so both the coarse and prog-point roles are reconciled.
 */
@EventsHandler(SignupEditedEvent)
export class ReconcileRolesEventHandler
  implements IEventHandler<SignupEditedEvent>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly progPointRolesService: ProgPointRolesService,
    private readonly errorService: ErrorService,
  ) {}

  async handle(event: SignupEditedEvent): Promise<void> {
    try {
      await this.reconcile(event);
    } catch (error) {
      this.errorService.captureError(error);
    }
  }

  private async reconcile({
    after,
    settings,
    guildId,
  }: SignupEditedEvent): Promise<void> {
    const progRole = settings.progRoles?.[after.encounter];
    const clearRole = settings.clearRoles?.[after.encounter];
    const mapping = settings.progPointRoles?.[after.encounter];

    if (!progRole && !clearRole && !mapping) {
      return;
    }

    const member = await this.discordService.getGuildMember({
      memberId: after.discordId,
      guildId,
    });

    if (!member) {
      return;
    }

    await this.progPointRolesService.applyChanges(
      member,
      this.progPointRolesService.computeCoarseRoleChanges(
        member,
        { progRole, clearRole },
        after.partyStatus,
      ),
    );

    await this.progPointRolesService.applyChanges(
      member,
      this.progPointRolesService.computeChanges(
        member,
        mapping,
        after.progPoint,
        { pruneUnmapped: true },
      ),
    );
  }
}
