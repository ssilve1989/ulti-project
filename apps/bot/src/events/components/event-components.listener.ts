import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Client, Events } from 'discord.js';
import { withUnitOfWork } from '../../common/sentry.js';
import { InjectDiscordClient } from '../../discord/discord.decorators.js';
import { ErrorService } from '../../error/error.service.js';
import { EventSignupFlow } from '../signup/event-signup.flow.js';
import { EventWithdrawFlow } from '../signup/event-withdraw.flow.js';
import { parseEventComponentId } from './event-component-id.js';

/**
 * Routes clicks on the buttons of event messages by their `customId`, so they
 * keep working for as long as the message exists, across restarts.
 */
@Injectable()
export class EventComponentsListener implements OnApplicationBootstrap {
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly signup: EventSignupFlow,
    private readonly withdraw: EventWithdrawFlow,
    private readonly errorService: ErrorService,
  ) {}

  onApplicationBootstrap() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!(interaction.isButton() && interaction.inCachedGuild())) return;
      const parsed = parseEventComponentId(interaction.customId);
      if (!parsed) return;

      return withUnitOfWork(() =>
        Sentry.withScope(async (scope) => {
          scope.setUser({
            id: interaction.user.id,
            username: interaction.user.username,
          });
          scope.setTag('component', `event:${parsed.action}`);

          try {
            const flow =
              parsed.action === 'signup' ? this.signup : this.withdraw;
            await flow.start(interaction, parsed.eventId);
          } catch (error) {
            await this.errorService.replyWithError(error, interaction);
          }
        }),
      );
    });
  }
}
