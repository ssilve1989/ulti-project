import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { SentryTraced } from '../../../observability/span.decorator.js';
import { TurboProgSheetsService } from '../../../sheets/turbo-prog-sheets/turbo-prog-sheets.service.js';
import { TurboProgRemoveSignupCommand } from '../turbo-prog.commands.js';

@CommandHandler(TurboProgRemoveSignupCommand)
class TurboProgRemoveSignupHandler
  implements ICommandHandler<TurboProgRemoveSignupCommand>
{
  constructor(private readonly sheetsService: TurboProgSheetsService) {}

  @SentryTraced()
  async execute({ entry, settings }: TurboProgRemoveSignupCommand) {
    const scope = Sentry.getCurrentScope();
    const spreadsheetId = settings?.turboProgSpreadsheetId;

    try {
      if (spreadsheetId) {
        await this.sheetsService.removeSignup(entry, spreadsheetId);
      }
    } catch (error) {
      scope.setExtra('entry', entry);
      scope.captureException(error);
    }
  }
}

export { TurboProgRemoveSignupHandler };
