import type {
  CollectedMessageInteraction,
  InteractionCollector,
  ModalSubmitInteraction,
} from 'discord.js';
import type { ProgPointDocument } from '../../../firebase/models/encounter.model.js';

export const ScreenState = {
  MAIN_MENU: 'main_menu',
  TOGGLE_SELECTION: 'toggle_selection',
  TOGGLE_CONFIRMATION: 'toggle_confirmation',
  EDIT_SELECTION: 'edit_selection',
  DELETE_SELECTION: 'delete_selection',
  REORDER: 'reorder',
  REORDER_POSITION: 'reorder_position',
} as const;

export type ScreenState = (typeof ScreenState)[keyof typeof ScreenState];

// Type-safe interfaces for pending operations
export interface PendingAddOperation {
  progPointId: string;
  longName: string;
  interaction: ModalSubmitInteraction;
  insertPosition?: number;
  action: 'add';
}

export interface PendingPartyStatusOperation {
  progPointId: string;
  longName: string;
  interaction?: ModalSubmitInteraction;
  insertPosition?: number;
  action: 'add' | 'edit';
}

export interface PendingReorderOperation {
  progPointToMove: string;
  sortedProgPoints: ProgPointDocument[];
}

export interface PendingToggleOperation {
  selectedProgPointIds: Set<string>;
  progPointsToActivate: ProgPointDocument[];
  progPointsToDeactivate: ProgPointDocument[];
}

// Discord.js collector type - uses the actual type returned by createMessageComponentCollector
export type ProgPointCollector =
  InteractionCollector<CollectedMessageInteraction>;

// Standard error type for consistency
export interface ProgPointError extends Error {
  code?: string | number;
  context?: Record<string, unknown>;
}
