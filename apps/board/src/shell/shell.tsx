import type { MeResponse } from '@ulti-project/shared';
import {
  createResource,
  createSignal,
  Match,
  type ParentProps,
  Switch,
} from 'solid-js';
import { api } from '../api/client';
import { NoAccessScreen } from './no-access-screen';
import { type LiveStatus, ShellContext } from './shell-context';
import { SignInScreen } from './sign-in-screen';
import { TopBar } from './top-bar';

/** The router's root: who's signed in decides between sign-in, no access and the board. */
export function Shell(props: ParentProps) {
  const [result, { refetch }] = createResource(() =>
    api<MeResponse>('/api/me'),
  );
  const [liveStatus, setLiveStatus] = createSignal<LiveStatus>();
  const refetchMe = () => void refetch();

  const me = () => {
    const current = result();
    return current?.ok ? current.body : undefined;
  };
  const deniedReason = () => {
    const current = result();
    if (current?.ok !== false || current.status !== 403) return undefined;
    const { reason } = current.body;
    return reason === 'not-in-guild' || reason === 'no-role'
      ? reason
      : undefined;
  };

  return (
    // While the first answer is loading, only the page background shows.
    <Switch>
      <Match when={me()}>
        {(signedIn) => (
          <ShellContext.Provider
            value={{
              get me() {
                return signedIn();
              },
              refetchMe,
              setLiveStatus,
            }}
          >
            <TopBar
              me={signedIn()}
              liveStatus={liveStatus()}
              refetchMe={refetchMe}
            />
            {props.children}
          </ShellContext.Provider>
        )}
      </Match>
      <Match when={result()?.status === 401}>
        <SignInScreen />
      </Match>
      <Match when={deniedReason()}>
        {(reason) => <NoAccessScreen reason={reason()} refetchMe={refetchMe} />}
      </Match>
      <Match when={result()}>
        <main class="screen">
          <h1>The board isn't reachable right now</h1>
          <button type="button" onClick={refetchMe}>
            Try again
          </button>
        </main>
      </Match>
    </Switch>
  );
}
