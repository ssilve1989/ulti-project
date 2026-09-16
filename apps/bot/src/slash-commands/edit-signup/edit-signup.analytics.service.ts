import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Encounter } from '@ulti-project/shared';
import type { EditKind } from './edit-signup.policy.js';

export type EditSignupGuardReason =
  | 'missingReviewerRole'
  | 'notReviewer'
  | 'notFound'
  | 'reviewPending'
  | 'announcementNotLinked';

export type EditSignupFunnelEvent =
  | 'invoked'
  | 'guard-blocked'
  | 'saved'
  | 'saved-with-sheets-error'
  | 'conflict'
  | 'cancelled'
  | 'timed-out';

interface EditSignupAnalyticsAttributes {
  encounter?: Encounter;
  kind?: EditKind;
  withComment?: boolean;
  guardReason?: EditSignupGuardReason;
}

@Injectable()
export class EditSignupAnalyticsService {
  invoked(encounter?: Encounter) {
    this.emit('invoked', { encounter });
  }

  guardBlocked(encounter: Encounter, reason: EditSignupGuardReason) {
    this.emit('guard-blocked', { encounter, guardReason: reason });
  }

  saved(kind: EditKind, encounter?: Encounter, withComment = false) {
    this.emit('saved', { encounter, kind, withComment });
  }

  savedWithSheetsError(kind: EditKind, encounter?: Encounter) {
    this.emit('saved-with-sheets-error', { encounter, kind });
  }

  conflict(kind: EditKind, encounter?: Encounter) {
    this.emit('conflict', { encounter, kind });
  }

  cancelled(encounter?: Encounter) {
    this.emit('cancelled', { encounter });
  }

  timedOut(encounter?: Encounter) {
    this.emit('timed-out', { encounter });
  }

  private emit(
    event: EditSignupFunnelEvent,
    attributes: EditSignupAnalyticsAttributes,
  ) {
    Sentry.metrics.count(`edit-signup.${event}`, 1, {
      attributes: {
        ...(attributes.encounter && { encounter: attributes.encounter }),
        ...(attributes.kind && { edit_kind: attributes.kind }),
        ...(attributes.withComment !== undefined && {
          with_comment: attributes.withComment,
        }),
        ...(attributes.guardReason && { guard_reason: attributes.guardReason }),
      },
    });
  }
}
