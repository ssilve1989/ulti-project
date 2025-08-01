import { CommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { match, P } from 'ts-pattern';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { TurboProgCommand } from '../commands/turbo-prog.commands.js';
import type { TurboProgEntry } from '../turbo-prog.interfaces.js';
import {
  type TurboProgSignupSchema,
  turboProgSignupSchema,
} from '../turbo-prog-signup.schema.js';
import {
  TURBO_PROG_INACTIVE,
  TURBO_PROG_MISSING_SIGNUPS_SHEETS,
  TURBO_PROG_NO_SIGNUP_FOUND,
  TURBO_PROG_SIGNUP_INVALID,
  TURBO_PROG_SUBMISSION_APPROVED,
} from '../turboprog.consts.js';

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
    private readonly sheetsService: SheetsService,
    private readonly signupCollection: SignupCollection,
  ) {}

  @SentryTraced()
  async execute({ interaction }: TurboProgCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const options = this.getOptions(interaction);
    Sentry.setExtra('options', options);

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings?.turboProgActive) {
      return await interaction.editReply(TURBO_PROG_INACTIVE);
    }

    if (settings.spreadsheetId && settings.turboProgSpreadsheetId) {
      // Find signup by discordId and encounter instead of character name
      const signup = await this.signupCollection.findOne({
        discordId: interaction.user.id,
        encounter: options.encounter,
      });

      const validation = await this.isProggerAllowed(
        options,
        settings.spreadsheetId,
        signup,
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

      Sentry.setExtra('validation', validation);
      throw new Error('Unexpected turbo prog validation error');
    }

    Sentry.setExtra('settings', settings);
    Sentry.captureMessage(
      'one or more spreadsheet IDs are missing for turbo prog',
    );
    return await interaction.editReply(TURBO_PROG_MISSING_SIGNUPS_SHEETS);
  }

  public isProggerAllowed(
    options: TurboProgSignupSchema,
    spreadsheetId: string,
    signup?: SignupDocument,
  ): Promise<ProggerAllowedResponse> | ProggerAllowedResponse {
    // if the progger has an entry already in the database we can check its status
    if (signup) {
      return (
        match([signup.status, signup.partyStatus])
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
              Sentry.setExtra('options', options);
              Sentry.captureMessage('Turbo Prog Signup Invalid', 'debug');
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
            () => this.findCharacterRowValues(options, spreadsheetId, signup),
          )
          .exhaustive()
      );
    }

    Sentry.captureMessage('No Signup Found for Turbo Prog', 'debug');
    return {
      allowed: undefined,
      error: TURBO_PROG_NO_SIGNUP_FOUND,
    };
  }

  private async findCharacterRowValues(
    options: TurboProgSignupSchema,
    spreadsheetId: string,
    signup: SignupDocument,
  ): Promise<ProggerAllowedResponse> {
    // Now we can use the character from the found signup
    const rowData = await this.sheetsService.findCharacterRowValues(
      { ...options, character: signup.character, world: signup.world },
      spreadsheetId,
    );

    if (rowData) {
      return {
        allowed: true,
        data: this.mapSheetData(rowData, options, signup.character),
      };
    }

    Sentry.setExtra('options', options);
    Sentry.captureMessage('No Signup Found for Turbo Prog', 'debug');
    return {
      allowed: undefined,
      error: TURBO_PROG_NO_SIGNUP_FOUND,
    };
  }

  private getOptions({
    options,
  }: ChatInputCommandInteraction<'cached' | 'raw'>) {
    return turboProgSignupSchema.parse({
      encounter: options.getString('encounter', true),
    });
  }

  private mapSignupToRowData(
    { progPointRequested, progPoint, role, character }: SignupDocument,
    { encounter }: TurboProgSignupSchema,
  ) {
    return {
      character,
      job: role,
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
    { encounter }: TurboProgSignupSchema,
    character: string,
  ) {
    if (values.length !== 4 || values.some((value, i) => i > 1 && !value)) {
      throw new Error(
        'Data found on Google Sheet is not in the correct format. Please check out that the regular signup sheet has your character entered correctly or reach out to a coordinator for assistance',
      );
    }
    // TODO: dear lord forgive us for our sins
    return {
      character,
      job: values[2],
      progPoint: values[3],
      encounter,
    };
  }
}

export { TurboProgCommandHandler };
