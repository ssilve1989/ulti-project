import { A } from '@solidjs/router';
import type { BoardAccess, MeResponse } from '@ulti-project/shared';
import { createSignal, Match, Show, Switch } from 'solid-js';
import type { LiveStatus } from './shell-context';
import { SignOutButton } from './sign-out-button';
import { applyTheme, readStoredTheme, storeTheme } from './theme';

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

function ThemeToggle() {
  const [theme, setTheme] = createSignal(
    readStoredTheme() ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const next = () => (theme() === 'dark' ? 'light' : 'dark');
  return (
    <button
      type="button"
      onClick={() => {
        const chosen = next();
        setTheme(chosen);
        applyTheme(chosen);
        storeTheme(chosen);
      }}
    >
      {next() === 'dark' ? 'Dark theme' : 'Light theme'}
    </button>
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
        ULTI PROJECT <span aria-hidden="true">▪</span> BOARD
      </A>
      <span
        class="live-status"
        data-state={props.liveStatus}
        aria-live="polite"
      >
        {props.liveStatus === 'live' ? 'Live' : ''}
        {props.liveStatus === 'reconnecting' ? 'Reconnecting…' : ''}
      </span>
      <span class="who">
        <Show when={props.me.avatarUrl}>
          {(src) => <img class="avatar" src={src()} alt="" />}
        </Show>
        <span>{props.me.displayName}</span>
        <AccessBadge access={props.me.access} />
      </span>
      <ThemeToggle />
      <SignOutButton refetchMe={props.refetchMe} />
    </header>
  );
}
