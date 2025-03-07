import { CommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { plainToClass } from 'class-transformer';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { P, match } from 'ts-pattern';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { TurboProgSignupInteractionDto } from '../../turbo-prog-signup-interaction.dto.js';
import type { TurboProgEntry } from '../../turbo-prog.interfaces.js';
import {
  TURBO_PROG_INACTIVE,
  TURBO_PROG_MISSING_SIGNUPS_SHEETS,
  TURBO_PROG_NO_SIGNUP_FOUND,
  TURBO_PROG_SIGNUP_INVALID,
  TURBO_PROG_SUBMISSION_APPROVED,
} from '../../turboprog.consts.js';
import { TurboProgCommand } from '../turbo-prog.commands.js';

type ProggerAllowedResponse =
  | {
      error: string;
      allowed: undefined;
    }
  | {
      allowed: true;
      data: TurboProgEntry;
    };

@CommandHandler(TurboProgCommand)
class TurboProgCommandHandler {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: TurboProgCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
        await this.sheetsService.upsertTurboProgEntry(
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

  public async isProggerAllowed(
    options: TurboProgSignupInteractionDto,
    spreadsheetId: string,
  ): Promise<ProggerAllowedResponse> {
    const signup = await this.signupCollection.findOne({
      character: options.character,
      encounter: options.encounter,
    });

    const scope = Sentry.getCurrentScope();
    // if the progger has an entry already in the database we can check its status
    if (signup) {
      const partyStatus = signup.partyStatus || signup.partyType;
      return (
        match([signup.status, partyStatus])
          .with(
            // has a bot signup that was approved with a party status
            [SignupStatus.APPROVED, PartyStatus.ClearParty],
            [SignupStatus.APPROVED, PartyStatus.ProgParty],
            () => ({
              allowed: true as true,
              data: this.mapSignupToRowData(signup, options),
            }),
          )
          .with(
            // has a bot signup that was approved but not an eligible party status
            [SignupStatus.APPROVED, PartyStatus.EarlyProgParty],
            [P.any, PartyStatus.Cleared],
            () => {
              scope.setExtra('options', options);
              scope.captureMessage('Turbo Prog Signup Invalid', 'debug');
              return {
                error: TURBO_PROG_SIGNUP_INVALID,
                allowed: undefined,
              };
            },
          )
          // they have a bot signup thats not been approved, but may have a prior signup on the sheet
          .with(
            [SignupStatus.APPROVED, P.nullish],
            [SignupStatus.DECLINED, P.any],
            [SignupStatus.PENDING, P.any],
            [SignupStatus.UPDATE_PENDING, P.any],
            () => this.findCharacterRowValues(options, spreadsheetId),
          )
          .exhaustive()
      );
    }
    // if they're not in the database as approved we need to check the google sheet
    return await this.findCharacterRowValues(options, spreadsheetId);
  }

  private async findCharacterRowValues(
    options: TurboProgSignupInteractionDto,
    spreadsheetId: string,
  ): Promise<ProggerAllowedResponse> {
    const scope = Sentry.getCurrentScope();
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
    scope.setExtra('options', options);
    scope.captureMessage('No Signup Found for Turbo Prog', 'debug');
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
