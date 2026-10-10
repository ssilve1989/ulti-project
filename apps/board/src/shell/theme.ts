import { readChoice, storeChoice } from '../stored-choice';

/** A theme, or `system` to follow `prefers-color-scheme`. */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'board-theme';
const CHOICES: readonly ThemeChoice[] = Object.freeze([
  'light',
  'dark',
  'system',
]);

export function readThemeChoice(): ThemeChoice {
  return readChoice(KEY, CHOICES) ?? 'system';
}

export function storeThemeChoice(choice: ThemeChoice): void {
  storeChoice(KEY, choice);
}

/** Sets the theme on `<html>`; for `system`, the stylesheet follows `prefers-color-scheme`. */
export function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
