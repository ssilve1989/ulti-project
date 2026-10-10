import { createSignal, Show } from 'solid-js';
import { authClient } from '../api/auth-client';

/** Signs out, then re-checks who's signed in; says so when it fails. */
export function SignOutButton(props: { readonly refetchMe: () => void }) {
  const [failed, setFailed] = createSignal(false);
  const signOut = async () => {
    setFailed(false);
    // better-auth answers an HTTP failure with `{ error }` and rejects on a network failure.
    const { error } = await authClient.signOut().catch((cause: unknown) => ({
      error: cause,
    }));
    if (error) setFailed(true);
    else props.refetchMe();
  };
  return (
    <>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
      <Show when={failed()}>
        <span role="alert">Couldn't sign out. Please try again.</span>
      </Show>
    </>
  );
}
