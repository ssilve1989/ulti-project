import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { TurboProgSheetsService } from '../../../sheets/turbo-prog-sheets/turbo-prog-sheets.service.js';
import { TurboProgRemoveSignupCommand } from '../turbo-prog.commands.js';

@CommandHandler(TurboProgRemoveSignupCommand)
class TurboProgRemoveSignupHandler
  implements ICommandHandler<TurboProgRemoveSignupCommand>
{
  constructor(private readonly sheetsService: TurboProgSheetsService) {}

  async execute({ entry, guildId, settings }: TurboProgRemoveSignupCommand) {
    const scope = Sentry.getCurrentScope();
    const spreadsheetId = settings?.turboProgSpreadsheetId;

    try {
      if (spreadsheetId) {
        await this.sheetsService.removeSignup(entry, spreadsheetId);
      }
    } catch (error) {
      scope.setExtra('args', { entry, guildId });
      scope.captureException(error);
    }
  }
}

export { TurboProgRemoveSignupHandler };
