import { useLocation } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { authClient } from '../api/auth-client';
import { SignInPreview } from './sign-in-preview';

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
    <main class="sign-in">
      <SignInPreview />
      <div class="screen">
        <p class="wordmark">
          ULTI PROJECT <span aria-hidden="true">▪</span> BOARD
        </p>
        <h1>Claim. Build. Post.</h1>
        <p class="tagline">The squad board for Ulti Project prog nights.</p>
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
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Sign in with Discord
        </button>
      </div>
    </main>
  );
}
