import { useLocation } from '@solidjs/router';
import { Show } from 'solid-js';
import { authClient } from '../api/auth-client';

export function SignInScreen() {
  const location = useLocation();
  const error = () => new URLSearchParams(location.search).get('error');

  const signIn = () => {
    // The page they opened, so a deep link survives sign-in.
    const params = new URLSearchParams(location.search);
    params.delete('error');
    const query = params.toString();
    void authClient.signIn.social({
      provider: 'discord',
      callbackURL: `${location.pathname}${query === '' ? '' : `?${query}`}`,
    });
  };

  return (
    <main class="screen">
      <h1>Sign in to the Ulti Project board</h1>
      <Show when={error()}>
        {(code) => (
          <p role="alert">
            {code() === 'access_denied'
              ? 'Sign-in was cancelled on Discord.'
              : "Signing in with Discord didn't work. Please try again."}
          </p>
        )}
      </Show>
      <button type="button" class="primary" onClick={signIn}>
        Sign in with Discord
      </button>
    </main>
  );
}
