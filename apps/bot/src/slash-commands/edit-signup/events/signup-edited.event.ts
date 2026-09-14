import type { PartyStatus, SignupDocument } from '@ulti-project/shared';
import type { User } from 'discord.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import type { EditKind } from '../edit-signup.policy.js';

export type EditedSignup = SignupDocument & {
  progPoint: string;
  partyStatus: PartyStatus;
};

/**
 * Published after /edit-signup has persisted an edit. Only edit handlers
 * subscribe; the reaction-review events are untouched.
 */
export class SignupEditedEvent {
  constructor(
    public readonly kind: EditKind,
    public readonly before: SignupDocument,
    public readonly after: EditedSignup,
    public readonly editor: User,
    public readonly settings: SettingsDocument,
    public readonly guildId: string,
    public readonly comment?: string,
  ) {}
}
