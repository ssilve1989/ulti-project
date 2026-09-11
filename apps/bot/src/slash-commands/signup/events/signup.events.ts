import type { SignupDocument } from '@ulti-project/shared';
import { Message, User } from 'discord.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';

export class SignupCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public guildId: string,
  ) {}
}

/**
 * Which flow produced the decision:
 * - `'approval'` — the standard reaction-review flow. For an approval, a
 *   public "Signup Approved" announcement is always posted fresh.
 * - `'edit'` — the `/edit-signup` command correcting an already-reviewed
 *   signup in place. For an approval, the existing announcement (if any) is
 *   edited rather than a second one being posted. For either decision, the
 *   review message's reactions are reset since a second reviewer may be
 *   overriding the first's decision.
 */
export type SignupApprovalKind = 'approval' | 'edit';

export class SignupApprovedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly settings: SettingsDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
    public readonly kind: SignupApprovalKind,
  ) {}
}

export class SignupDeclinedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
    public readonly kind: SignupApprovalKind,
  ) {}
}

export class SignupDeclineReasonCollectedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
    public readonly declineReason?: string,
  ) {}
}

export class SignupApprovalSentEvent {
  constructor(
    public readonly signup: Pick<
      SignupDocument,
      'discordId' | 'character' | 'reviewMessageId'
    >,
    public readonly guildId: string,
  ) {}
}
