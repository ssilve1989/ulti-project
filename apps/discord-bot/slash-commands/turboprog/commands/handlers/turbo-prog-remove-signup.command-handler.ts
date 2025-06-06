import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { TurboProgRemoveSignupCommand } from '../turbo-prog.commands.js';

@CommandHandler(TurboProgRemoveSignupCommand)
class TurboProgRemoveSignupHandler
  implements ICommandHandler<TurboProgRemoveSignupCommand>
{
  constructor(
    private readonly sheetsService: SheetsService,
    private readonly settingsCollection: SettingsCollection,
  ) {}

  @SentryTraced()
  async execute({ entry, guildId }: TurboProgRemoveSignupCommand) {
    const scope = Sentry.getCurrentScope();
    const settings = await this.settingsCollection.getSettings(guildId);
    const spreadsheetId = settings?.turboProgSpreadsheetId;

    try {
      if (spreadsheetId) {
        await this.sheetsService.removeTurboProgEntry(entry, spreadsheetId);
      }
    } catch (error) {
      scope.setExtra('entry', entry);
      scope.captureException(error);
    }
  }
}

export { TurboProgRemoveSignupHandler };
