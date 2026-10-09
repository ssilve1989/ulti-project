import { useLocation } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { authClient } from '../api/auth-client';

export function SignInScreen() {
  const location = useLocation();
  const error = () => new URLSearchParams(location.search).get('error');
  const [startFailed, setStartFailed] = createSignal(false);

  const signIn = async () => {
    setStartFailed(false);
    // The page they opened, so a deep link survives sign-in.
    const params = new URLSearchParams(location.search);
    params.delete('error');
    const query = params.toString();
    // better-auth answers an HTTP failure with `{ error }` and rejects on a network failure.
    const { error: failure } = await authClient.signIn
      .social({
        provider: 'discord',
        callbackURL: `${location.pathname}${query === '' ? '' : `?${query}`}`,
      })
      .catch((cause: unknown) => ({ error: cause }));
    setStartFailed(Boolean(failure));
  };

  return (
    <main class="screen">
      <h1>Sign in to the Ulti Project board</h1>
      {/* A failed new attempt replaces what Discord's return said. */}
      <Show when={startFailed() ? undefined : error()}>
        {(code) => (
          <p role="alert">
            {code() === 'access_denied'
              ? 'Sign-in was cancelled on Discord.'
              : "Signing in with Discord didn't work. Please try again."}
          </p>
        )}
      </Show>
      <Show when={startFailed()}>
        <p role="alert">Couldn't start signing in. Please try again.</p>
      </Show>
      <button type="button" class="primary" onClick={signIn}>
        Sign in with Discord
      </button>
    </main>
  );
}
