import { Injectable } from '@nestjs/common';
import {
  type Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { User } from 'discord.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';

/**
 * Owns the data mutation performed for a signup review decision *before* the
 * corresponding `SignupApprovedEvent` / `SignupDeclinedEvent` is published.
 * Extracted from `SignupService` so a future `/edit-signup` command can reuse
 * the exact same persistence path.
 */
@Injectable()
export class SignupMutationService {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly sheetsService: SheetsService,
    private readonly repository: SignupCollection,
  ) {}

  /**
   * Resolve the party status for a confirmed prog point. `PartyStatus.Cleared`
   * is a short-circuit; anything else is delegated to the encounters service.
   */
  async resolvePartyStatus(
    encounter: Encounter,
    progPoint: string,
  ): Promise<PartyStatus> {
    if (progPoint === PartyStatus.Cleared) {
      return PartyStatus.Cleared;
    }

    return await this.encountersService.getPartyStatusForProgPoint(
      encounter,
      progPoint,
    );
  }

  /**
   * Produce the signup document as it should be persisted once the reviewer has
   * confirmed a prog point: the original signup spread with `progPoint` and the
   * derived `partyStatus`. With no prog point, `partyStatus` is left undefined
   * and the encounters service is not consulted.
   *
   * When this overwrites a progPoint that's already reflected on the sheet
   * (i.e. `signup.progPoint` is set and differs from the new value), the
   * outgoing value is snapshotted as `previousProgPoint`/`previousPartyStatus`
   * so a later decline can restore it instead of just wiping the sheet row.
   */
  async buildConfirmedSignup(
    signup: SignupDocument,
    progPoint: string | undefined,
  ): Promise<SignupDocument> {
    const partyStatus = progPoint
      ? await this.resolvePartyStatus(signup.encounter, progPoint)
      : undefined;

    const isOverwritingSheetValue =
      signup.progPoint !== undefined && signup.progPoint !== progPoint;

    return {
      ...signup,
      progPoint,
      partyStatus,
      previousProgPoint: isOverwritingSheetValue
        ? signup.progPoint
        : signup.previousProgPoint,
      previousPartyStatus: isOverwritingSheetValue
        ? signup.partyStatus
        : signup.previousPartyStatus,
    };
  }

  /**
   * Persist an approval decision. Sheets upsert runs first and is FATAL —
   * it must succeed before the Firestore status write; do not swallow it.
   * TODO(sheets-deprecation): Sheets is slated to leave the signup flow
   * entirely. When that lands, remove the upsert + the spreadsheetId guard here.
   */
  async applyApproval(
    confirmedSignup: SignupDocument,
    settings: SettingsDocument,
    reviewer: User,
  ): Promise<void> {
    if (settings.spreadsheetId) {
      await this.sheetsService.upsertSignup(
        confirmedSignup,
        settings.spreadsheetId,
      );
    }

    const hasCleared = confirmedSignup.partyStatus === PartyStatus.Cleared;

    if (hasCleared) {
      await this.repository.removeSignup(this.sheetKey(confirmedSignup));
    } else {
      await this.repository.updateSignupStatus(
        SignupStatus.APPROVED,
        confirmedSignup,
        reviewer.username,
      );
    }
  }

  /**
   * Persist a decline decision. Declining a signup that's currently APPROVED
   * undoes that approval's sheet side effect: revert the sheet row (and the
   * Firestore progPoint/partyStatus) to the snapshotted `previousProgPoint`/
   * `previousPartyStatus`, or remove the row entirely when there was none.
   * Declining anything else (PENDING/UPDATE_PENDING) never touched the sheet
   * in the first place, so it's left untouched.
   */
  async applyDecline(
    signup: SignupDocument,
    settings: SettingsDocument,
    reviewer: User,
  ): Promise<void> {
    if (signup.status !== SignupStatus.APPROVED) {
      await this.repository.updateSignupStatus(
        SignupStatus.DECLINED,
        signup,
        reviewer.username,
      );
      return;
    }

    const revert = {
      progPoint: signup.previousProgPoint,
      partyStatus: signup.previousPartyStatus,
    };

    if (settings.spreadsheetId) {
      if (revert.progPoint !== undefined) {
        await this.sheetsService.upsertSignup(
          { ...signup, ...revert },
          settings.spreadsheetId,
        );
      } else {
        await this.sheetsService.removeSignup(
          this.sheetKey(signup),
          settings.spreadsheetId,
        );
      }
    }

    await this.repository.declineSignup(signup, reviewer.username, revert);
  }

  private sheetKey(
    signup: Pick<SignupDocument, 'character' | 'world' | 'encounter'>,
  ): Pick<SignupDocument, 'character' | 'world' | 'encounter'> {
    return {
      character: signup.character,
      world: signup.world,
      encounter: signup.encounter,
    };
  }
}
