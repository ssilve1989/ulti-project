import { PartyStatus } from '../../firebase/models/signup.model.js';

export class ThresholdError extends Error {
  constructor(
    public readonly progPointId: string,
    public readonly progPointLabel: string,
    public readonly thresholdType:
      | PartyStatus.ProgParty
      | PartyStatus.ClearParty,
    public readonly encounterId: string,
  ) {
    const thresholdName =
      thresholdType === PartyStatus.ProgParty ? 'Prog Party' : 'Clear Party';
    super(
      `Cannot deactivate prog point ${progPointId} - used as ${thresholdName} threshold`,
    );
    this.name = 'ThresholdError';
  }
}
