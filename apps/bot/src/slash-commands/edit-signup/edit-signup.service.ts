import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  type PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { EncountersService } from '../../encounters/encounters.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  type ReviewDecisionEntry,
  withTrackingSeed,
} from '../signup/review-history.js';
import type { EditKind } from './edit-signup.policy.js';
import {
  type EditedSignup,
  SignupEditedEvent,
} from './events/signup-edited.event.js';

interface ApplyEditInput {
  kind: EditKind;
  signup: SignupDocument;
  updateTime: Timestamp;
  progPoint: string;
  editor: User;
  comment?: string;
  settings: SettingsDocument;
  guildId: string;
}

export type ApplyEditResult =
  | { type: 'saved' }
  | { type: 'savedWithSheetsError' }
  | { type: 'conflict' };

@Injectable()
export class EditSignupService {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly signupCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
    private readonly errorService: ErrorService,
    private readonly eventBus: EventBus,
  ) {}

  @SentryTraced()
  async apply({
    kind,
    signup,
    updateTime,
    progPoint,
    editor,
    comment,
    settings,
    guildId,
  }: ApplyEditInput): Promise<ApplyEditResult> {
    // re-resolve rather than trust the value shown on the edit screen
    const partyStatus = await this.encountersService.getPartyStatusForProgPoint(
      signup.encounter,
      progPoint,
    );
    const at = Timestamp.now();
    const historyEntries = withTrackingSeed(
      signup,
      createEditEntry(kind, { progPoint, partyStatus, actorId: editor.id, at }),
      at,
    );

    // Firestore first: its precondition is what stops an edit overwriting a
    // re-submission or a concurrent edit, and Sheets cannot take part in it.
    const write = await this.signupCollection.applyEdit(
      signup,
      { progPoint, partyStatus, historyEntries },
      updateTime,
    );

    if (write.type === 'conflict') {
      return { type: 'conflict' };
    }

    const after: EditedSignup = {
      ...signup,
      status: SignupStatus.APPROVED,
      progPoint,
      partyStatus,
      reviewHistory: [...(signup.reviewHistory ?? []), ...historyEntries],
    };

    const sheetsUpdated = await this.syncSheet(after, settings);

    this.eventBus.publish(
      new SignupEditedEvent(
        kind,
        signup,
        after,
        editor,
        settings,
        guildId,
        comment,
      ),
    );

    return sheetsUpdated ? { type: 'saved' } : { type: 'savedWithSheetsError' };
  }

  private async syncSheet(
    signup: EditedSignup,
    { spreadsheetId }: SettingsDocument,
  ): Promise<boolean> {
    if (!spreadsheetId) {
      return true;
    }

    try {
      await this.sheetsService.upsertSignup(signup, spreadsheetId);
      return true;
    } catch (error) {
      this.errorService.captureError(error);
      return false;
    }
  }
}

function createEditEntry(
  kind: EditKind,
  fields: {
    progPoint: string;
    partyStatus: PartyStatus;
    actorId: string;
    at: Timestamp;
  },
): ReviewDecisionEntry {
  return kind === 'correction'
    ? { type: 'progPointEdited', via: 'edit', ...fields }
    : { type: 'approved', via: 'edit', ...fields };
}
