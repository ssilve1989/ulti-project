import { readChoice, storeChoice } from '../stored-choice';

export type Theme = 'light' | 'dark';

const KEY = 'board-theme';
const THEMES: readonly Theme[] = Object.freeze(['light', 'dark']);

export function readStoredTheme(): Theme | undefined {
  return readChoice(KEY, THEMES);
}

export function storeTheme(theme: Theme): void {
  storeChoice(KEY, theme);
}

/** Sets the theme on `<html>`; with none, the stylesheet follows `prefers-color-scheme`. */
export function applyTheme(theme: Theme | undefined): void {
  if (theme !== undefined) document.documentElement.dataset.theme = theme;
}
