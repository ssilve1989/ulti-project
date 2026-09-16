import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EncounterFriendlyDescription } from '@ulti-project/shared';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  EncountersService,
  progPointLabelMap,
} from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { quoteLines } from '../../signup/signup.utils.js';
import { SignupEditedEvent } from '../events/signup-edited.event.js';

@EventsHandler(SignupEditedEvent)
export class NotifyApplicantEventHandler
  implements IEventHandler<SignupEditedEvent>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly encountersService: EncountersService,
    private readonly errorService: ErrorService,
  ) {}

  async handle(event: SignupEditedEvent): Promise<void> {
    try {
      const progPoints = await this.encountersService.getProgPoints(
        event.after.encounter,
      );
      const labels = progPointLabelMap(progPoints);

      await this.discordService.sendDirectMessage(event.after.discordId, {
        content: buildApplicantMessage(event, labels),
      });
    } catch (error) {
      this.errorService.captureError(error);
    }
  }
}

function buildApplicantMessage(
  { kind, before, after, comment }: SignupEditedEvent,
  labels: ReadonlyMap<string, string>,
): string {
  const encounter = EncounterFriendlyDescription[after.encounter];
  const label = (progPoint: string | undefined) =>
    progPoint ? (labels.get(progPoint) ?? progPoint) : 'none';

  const message =
    kind === 'correction'
      ? `Your approved prog point for **${encounter}** was updated: \`${label(before.progPoint)}\` → \`${label(after.progPoint)}\`.`
      : `Your signup for **${encounter}** has been approved at \`${label(after.progPoint)}\`. This replaces the earlier decline.`;

  return comment
    ? `${message}\n\nThe reviewer left you a comment:\n\n${quoteLines(comment)}`
    : message;
}
