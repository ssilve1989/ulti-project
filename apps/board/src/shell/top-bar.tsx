import { A } from '@solidjs/router';
import type { BoardAccess, MeResponse } from '@ulti-project/shared';
import { createSignal, For, type JSX, Match, Show, Switch } from 'solid-js';
import type { LiveStatus } from './shell-context';
import { SignOutButton } from './sign-out-button';
import {
  applyTheme,
  readThemeChoice,
  storeThemeChoice,
  type ThemeChoice,
} from './theme';

function AccessBadge(props: { readonly access: BoardAccess }) {
  return (
    <Switch>
      <Match
        when={props.access.kind === 'squad' ? props.access.squad : undefined}
      >
        {(squad) => (
          <span
            class="squad-token"
            role="img"
            title={`Your squad: ${squad().name}`}
            aria-label={`Your squad: ${squad().name}`}
            style={{ '--sq': squad().color }}
          >
            {squad().tag}
          </span>
        )}
      </Match>
      <Match when={props.access.kind === 'viewer'}>
        <span class="badge">read-only</span>
      </Match>
      <Match when={props.access.kind === 'squad-conflict'}>
        <span class="badge">two squad roles: ask an admin</span>
      </Match>
    </Switch>
  );
}

function Icon(props: {
  readonly class: string;
  readonly children: JSX.Element;
}) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {props.children}
    </svg>
  );
}

const THEME_OPTIONS: readonly {
  choice: ThemeChoice;
  label: string;
  icon: () => JSX.Element;
}[] = [
  {
    choice: 'light',
    label: 'Light',
    icon: () => (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </>
    ),
  },
  {
    choice: 'dark',
    label: 'Dark',
    icon: () => <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  },
  {
    choice: 'system',
    label: 'Match system',
    icon: () => (
      <>
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
];

function ThemePicker() {
  const [choice, setChoice] = createSignal(readThemeChoice());
  const choose = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
    storeThemeChoice(next);
  };
  return (
    <fieldset class="theme-picker">
      <legend>Theme</legend>
      <span class="segmented">
        <For each={THEME_OPTIONS}>
          {(option) => (
            <label title={option.label}>
              <input
                type="radio"
                name="theme"
                checked={choice() === option.choice}
                onChange={() => choose(option.choice)}
              />
              <Icon class="theme-icon">{option.icon()}</Icon>
              <span class="sr-only">{option.label}</span>
            </label>
          )}
        </For>
      </span>
    </fieldset>
  );
}

export function TopBar(props: {
  readonly me: MeResponse;
  readonly liveStatus: LiveStatus | undefined;
  readonly refetchMe: () => void;
}) {
  return (
    <header class="top-bar">
      <A href="/" class="wordmark">
        ULTI <span class="long">PROJECT </span>
        <span aria-hidden="true">▪</span> BOARD
      </A>
      <span
        class="live-status"
        data-state={props.liveStatus}
        aria-live="polite"
      >
        {props.liveStatus === 'live' ? 'Live' : ''}
        {props.liveStatus === 'reconnecting' ? 'Reconnecting…' : ''}
      </span>
      <button type="button" class="account" popovertarget="account-menu">
        <Show when={props.me.avatarUrl}>
          {(src) => <img class="avatar" src={src()} alt="" />}
        </Show>
        <span class="name">{props.me.displayName}</span>
        <AccessBadge access={props.me.access} />
        <Icon class="chevron">
          <path d="m6 9 6 6 6-6" />
        </Icon>
      </button>
      <div id="account-menu" class="account-menu" popover>
        <p class="signed-in-as">Signed in as {props.me.displayName}</p>
        <ThemePicker />
        <SignOutButton refetchMe={props.refetchMe} />
      </div>
    </header>
  );
}
