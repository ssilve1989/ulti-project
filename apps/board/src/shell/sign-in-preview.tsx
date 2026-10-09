import { For, Show } from 'solid-js';

interface PreviewRow {
  readonly name: string;
  readonly role: 'tank' | 'heal' | 'dps';
  readonly phase: string;
  readonly squad?: { readonly tag: string; readonly color: string };
}

// Fictional sample sign-ups, so the page shows what the board does.
const ROWS: readonly PreviewRow[] = [
  {
    name: 'Aeryn Vail',
    role: 'tank',
    phase: 'P4: Enrage',
    squad: { tag: 'FRG', color: '#16a34a' },
  },
  { name: 'Echo Fragment', role: 'heal', phase: 'P4: Enrage' },
  {
    name: 'Nael Vintage',
    role: 'dps',
    phase: 'P4: AM1',
    squad: { tag: 'SPC', color: '#0891b2' },
  },
  { name: 'Kestrel Dawn', role: 'dps', phase: 'P3: Apoc' },
  {
    name: 'Mira Solenne',
    role: 'heal',
    phase: 'P2: Light Rampant',
    squad: { tag: 'FRG', color: '#16a34a' },
  },
];

export function SignInPreview() {
  return (
    <div class="sign-in-preview" aria-hidden="true">
      <p class="preview-head">LIVE · FRU · PROG PARTY</p>
      <ul>
        <For each={ROWS}>
          {(row, index) => (
            <li
              class="preview-row"
              style={{ '--i': index(), '--edge': `var(--${row.role})` }}
            >
              <span>{row.name}</span>
              <span class="preview-phase">{row.phase}</span>
              <Show when={row.squad}>
                {(squad) => (
                  <span class="squad-token" style={{ '--sq': squad().color }}>
                    {squad().tag}
                  </span>
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
