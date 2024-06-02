import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { P, match } from 'ts-pattern';
import { DiscordService } from '../../../discord/discord.service.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { SignupApprovedEvent } from '../signup.events.js';

@EventsHandler(SignupApprovedEvent)
class AssignRolesEventHandler implements IEventHandler<SignupApprovedEvent> {
  private readonly logger = new Logger(AssignRolesEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent) {
    const {
      signup: { discordId, encounter, partyType, partyStatus },
      settings,
      guildId,
    } = event;
    const scope = Sentry.getCurrentScope();
    const status = partyType ?? partyStatus;

    try {
      await match(status)
        // TODO: Support clear roles
        .with(PartyStatus.ClearParty, () =>
          this.assignRole(discordId, guildId, undefined),
        )
        .with(PartyStatus.ProgParty, PartyStatus.EarlyProgParty, () =>
          this.assignRole(discordId, guildId, settings.progRoles?.[encounter]),
        )
        .with(PartyStatus.Cleared, P.nullish, () => undefined)
        .exhaustive();
    } catch (error) {
      scope.setExtra('event', event);
      scope.captureException(error);
    }
  }

  private async assignRole(discordId: string, guildId: string, role?: string) {
    if (role) {
      const member = await this.discordService.getGuildMember({
        memberId: discordId,
        guildId,
      });
      await member?.roles.add(role);

      this.logger.log(`Assigned role ${role} to ${member?.user.username}`);
    }
  }
}

export { AssignRolesEventHandler };
