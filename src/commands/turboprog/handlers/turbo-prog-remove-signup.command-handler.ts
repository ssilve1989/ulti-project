import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { TurboProgSheetsService } from '../../../sheets/turbo-prog-sheets/turbo-prog-sheets.service.js';
import { TurboProgRemoveSignupCommand } from '../turbo-prog.commands.js';

@CommandHandler(TurboProgRemoveSignupCommand)
class TurboProgRemoveSignupHandler
  implements ICommandHandler<TurboProgRemoveSignupCommand>
{
  constructor(
    private readonly settings: SettingsCollection,
    private readonly sheetsService: TurboProgSheetsService,
  ) {}

  async execute({ entry, guildId }: TurboProgRemoveSignupCommand) {
    const scope = Sentry.getCurrentScope();

    try {
      const settings = await this.settings.getSettings(guildId);
      const spreadsheetId = settings?.turboProgSpreadsheetId;

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
