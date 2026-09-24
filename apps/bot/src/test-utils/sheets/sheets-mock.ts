import { PartyStatus, type SignupDocument } from '@ulti-project/shared';
import type { SheetsService } from '../../sheets/sheets.service.js';

/** Records signup rows per spreadsheet the way SheetsService would lay them out. */
export class SheetsMock implements Pick<SheetsService, 'upsertSignup'> {
  private readonly sheets = new Map<string, Map<string, SignupDocument>>();

  upsertSignup(signup: SignupDocument, spreadsheetId: string): Promise<void> {
    const rows = this.sheet(spreadsheetId);
    const key = `${signup.character}-${signup.world}-${signup.encounter}`;

    switch (signup.partyStatus) {
      case PartyStatus.EarlyProgParty:
      case PartyStatus.ProgParty:
      case PartyStatus.ClearParty:
        rows.set(key, signup);
        break;
      case PartyStatus.Cleared:
        rows.delete(key);
        break;
      default:
        // the real service logs and writes nothing for an unknown party status
        break;
    }
    return Promise.resolve();
  }

  rows(spreadsheetId: string): SignupDocument[] {
    return [...this.sheet(spreadsheetId).values()];
  }

  private sheet(spreadsheetId: string): Map<string, SignupDocument> {
    const existing = this.sheets.get(spreadsheetId);
    if (existing) return existing;
    const created = new Map<string, SignupDocument>();
    this.sheets.set(spreadsheetId, created);
    return created;
  }
}
