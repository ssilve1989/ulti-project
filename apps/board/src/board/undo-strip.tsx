import { createEffect, onCleanup, Show } from 'solid-js';
import type { ClaimNotice } from './claims';

/** A party's latest claim notice, with Undo when it has one; hides 5 seconds after each new notice. */
export function UndoStrip(props: {
  readonly notice: ClaimNotice | undefined;
  readonly onDismiss: () => void;
}) {
  createEffect(() => {
    if (props.notice === undefined) return;
    const timer = setTimeout(props.onDismiss, 5000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    // The status region stays mounted, so a screen reader announces each new message; only a notice draws the strip.
    <div classList={{ undo: props.notice !== undefined }}>
      <span role="status">{props.notice?.message}</span>
      <Show when={props.notice}>
        {(notice) => (
          <>
            <Show when={notice().undo}>
              {(undo) => (
                <button
                  type="button"
                  class="undo-btn"
                  aria-label="Undo"
                  onClick={() => {
                    const run = undo();
                    // Gone at once, so Undo can't be sent twice.
                    props.onDismiss();
                    run();
                  }}
                >
                  Undo
                </button>
              )}
            </Show>
            <button
              type="button"
              class="undo-x"
              aria-label="Dismiss"
              onClick={() => props.onDismiss()}
            >
              ×
            </button>
          </>
        )}
      </Show>
    </div>
  );
}
