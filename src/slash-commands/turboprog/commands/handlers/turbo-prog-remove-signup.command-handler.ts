import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { TurboProgSheetsService } from '../../../../sheets/turbo-prog-sheets/turbo-prog-sheets.service.js';
import { TurboProgRemoveSignupCommand } from '../turbo-prog.commands.js';

@CommandHandler(TurboProgRemoveSignupCommand)
class TurboProgRemoveSignupHandler
  implements ICommandHandler<TurboProgRemoveSignupCommand>
{
  constructor(
    private readonly sheetsService: TurboProgSheetsService,
    private readonly settingsCollection: SettingsCollection,
  ) {}

  @SentryTraced()
  async execute({ entry, guildId }: TurboProgRemoveSignupCommand) {
    const scope = Sentry.getCurrentScope();
    const settings = await this.settingsCollection.getSettings(guildId);
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
