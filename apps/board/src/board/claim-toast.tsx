import { createEffect, onCleanup, Show } from 'solid-js';
import type { ClaimNotice } from './claims';

/** The board's latest claim notice, as a toast; hides 5 seconds after each new notice. */
export function ClaimToast(props: {
  readonly notice: ClaimNotice | undefined;
  readonly onDismiss: () => void;
}) {
  createEffect(() => {
    if (props.notice === undefined) return;
    const timer = setTimeout(props.onDismiss, 5000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    // The status region stays mounted, so a screen reader announces each new message; only a notice draws the toast.
    <div classList={{ toast: props.notice !== undefined }}>
      <span role="status">{props.notice?.message}</span>
      <Show when={props.notice}>
        <button
          type="button"
          class="toast-x"
          aria-label="Dismiss"
          onClick={() => props.onDismiss()}
        >
          ×
        </button>
      </Show>
    </div>
  );
}
