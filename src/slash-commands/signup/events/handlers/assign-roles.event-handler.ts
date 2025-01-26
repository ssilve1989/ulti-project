import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { P, match } from 'ts-pattern';
import { DiscordService } from '../../../../discord/discord.service.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import { SignupApprovedEvent } from '../signup.events.js';

interface SetRoleParameters {
  discordId: string;
  guildId: string;
  role?: string;
  action: 'add' | 'remove';
}

@EventsHandler(SignupApprovedEvent)
class AssignRolesEventHandler implements IEventHandler<SignupApprovedEvent> {
  private readonly logger = new Logger(AssignRolesEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent) {
    const {
      signup: { discordId, encounter, partyStatus },
      settings: { progRoles, clearRoles },
      message: { guildId },
    } = event;
    const scope = Sentry.getCurrentScope();

    const progRole = progRoles?.[encounter];
    const clearRole = clearRoles?.[encounter];

    try {
      await match(partyStatus)
        .with(PartyStatus.ClearParty, () =>
          Promise.all([
            this.updateRole({
              discordId,
              guildId,
              action: 'remove',
              role: progRole,
            }),
            this.updateRole({
              discordId,
              guildId,
              role: clearRole,
              action: 'add',
            }),
          ]),
        )
        .with(PartyStatus.ProgParty, PartyStatus.EarlyProgParty, () =>
          this.updateRole({
            discordId,
            guildId,
            action: 'add',
            role: progRole,
          }),
        )
        // this case is actually handled by the RemoveRolesCommandHandler
        // which is a little confusing, we should centralize how roles are managed
        .with(PartyStatus.Cleared, P.nullish, () => undefined)
        .exhaustive();
    } catch (error) {
      scope.setExtra('event', event);
      scope.captureException(error);
    }
  }

  private async updateRole({
    discordId,
    guildId,
    role,
    action,
  }: SetRoleParameters) {
    if (role) {
      const member = await this.discordService.getGuildMember({
        memberId: discordId,
        guildId,
      });

      if (member) {
        if (action === 'remove') {
          await member.roles.remove(role);
          this.logger.log(`Removed role ${role} from ${member?.user.username}`);
        } else if (action === 'add') {
          await member.roles.add(role);
          this.logger.log(`Assigned role ${role} to ${member?.user.username}`);
        }
      }
    }
  }
}

export { AssignRolesEventHandler };
