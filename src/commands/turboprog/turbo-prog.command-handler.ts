import { CommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { plainToClass } from 'class-transformer';
import { ChatInputCommandInteraction } from 'discord.js';
import { match } from 'ts-pattern';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { TurboProgSheetsService } from '../../sheets/turbo-prog-sheets/turbo-prog-sheets.service.js';
import { TurboProgSignupInteractionDto } from './turbo-prog-signup-interaction.dto.js';
import { TurboProgCommand } from './turbo-prog.command.js';
import { TurboProgEntry } from './turbo-prog.interfaces.js';
import {
  TURBO_PROG_INACTIVE,
  TURBO_PROG_MISSING_SIGNUPS_SHEETS,
  TURBO_PROG_NO_SIGNUP_FOUND,
  TURBO_PROG_SIGNUP_INVALID,
  TURBO_PROG_SUBMISSION_APPROVED,
} from './turboprog.consts.js';

@CommandHandler(TurboProgCommand)
class TurboProgCommandHandler {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
    private readonly turboSheetService: TurboProgSheetsService,
  ) {}

  async execute({ interaction }: TurboProgCommand) {
    await interaction.deferReply({ ephemeral: true });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings?.turboProgActive) {
      return await interaction.editReply(TURBO_PROG_INACTIVE);
    }

    const options = this.getOptions(interaction);
    const scope = Sentry.getCurrentScope();
    scope.setExtra('input', options);

    if (settings.spreadsheetId && settings.turboProgSpreadsheetId) {
      const validation = await this.isProggerAllowed(
        options,
        settings.spreadsheetId,
      );

      if (validation.allowed) {
        await this.turboSheetService.upsert(
          validation.data,
          settings.turboProgSpreadsheetId,
        );

        return await interaction.editReply(TURBO_PROG_SUBMISSION_APPROVED);
      }

      if (validation.error) {
        return await interaction.editReply(validation.error);
      }

      scope.setExtra('validation', validation);
      throw new Error('Unexpected turbo prog validation error');
    }

    scope.setExtra('settings', settings);
    scope.captureMessage(
      'one or more spreadsheet IDs are missing for turbo prog',
    );
    return await interaction.editReply(TURBO_PROG_MISSING_SIGNUPS_SHEETS);
  }

  private async isProggerAllowed(
    options: TurboProgSignupInteractionDto,
    spreadsheetId: string,
  ): Promise<
    | {
        error: string;
        allowed: undefined;
      }
    | {
        allowed: true;
        data: TurboProgEntry;
      }
  > {
    const signup = await this.signupCollection.findOne({
      character: options.character,
      world: options.world,
      encounter: options.encounter,
    });

    // if the progger has an entry already in the database we can check its status
    if (signup) {
      return match(signup)
        .with(
          {
            status: SignupStatus.APPROVED,
          },
          ({ partyStatus, partyType }) =>
            partyStatus === PartyStatus.ClearParty ||
            partyStatus === PartyStatus.ProgParty ||
            partyType === PartyStatus.ClearParty ||
            partyType === PartyStatus.ProgParty,
          () => ({
            allowed: true as true, // TODO: dafuq typescript
            data: this.mapSignupToRowData(signup, options),
          }),
        )
        .otherwise(() => ({
          allowed: undefined,
          error: TURBO_PROG_SIGNUP_INVALID,
        }));
    }

    // if they're not in the database as approved we need to check the google sheet
    const rowData = await this.sheetsService.findCharacterRowValues(
      options,
      spreadsheetId,
    );

    if (rowData) {
      return {
        allowed: true,
        data: this.mapSheetData(rowData, options),
      };
    }

    return {
      allowed: undefined,
      error: TURBO_PROG_NO_SIGNUP_FOUND,
    };
  }

  private getOptions({
    options,
  }: ChatInputCommandInteraction<'cached' | 'raw'>) {
    return plainToClass(TurboProgSignupInteractionDto, {
      availability: options.getString('availability', true),
      character: options.getString('character', true),
      encounter: options.getString('encounter', true),
      role: options.getString('job', true),
    });
  }

  private mapSignupToRowData(
    { progPointRequested, progPoint }: SignupDocument,
    { character, role, availability, encounter }: TurboProgSignupInteractionDto,
  ) {
    return {
      character,
      job: role,
      availability,
      encounter,
      progPoint: progPoint || progPointRequested,
    };
  }

  /**
   * maps the sheet data from the standard google sheet to the turbo prog format
   * @param
   */
  private mapSheetData(
    values: string[],
    { availability, encounter }: TurboProgSignupInteractionDto,
  ) {
    if (values.length !== 4 || values.some((value, i) => i > 1 && !value)) {
      throw new Error(
        'Data found on Google Sheet is not in the correct format. Please check out that the regular signup sheet has your character entered correctly or reach out to a coordinator for assistance',
      );
    }

    // TODO: dear lord forgive us for our sins
    return {
      character: values[0],
      job: values[2],
      progPoint: values[3],
      availability,
      encounter,
    };
  }
}

export { TurboProgCommandHandler };
