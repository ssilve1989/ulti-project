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
 * Which flow produced the review decision:
 * - `'approval'` / `'decline'` — the standard reaction-review flow. Only this
 *   flow offers the reviewer the optional comment / decline-reason follow-up DM.
 * - `'edit'` — the `/edit-signup` command correcting an already-reviewed signup
 *   in place: the existing announcement is edited rather than re-posted, and no
 *   follow-up DM is offered.
 */
export type SignupApprovalKind = 'approval' | 'edit';
export type SignupDeclineKind = 'decline' | 'edit';

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
    public readonly kind: SignupDeclineKind,
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
