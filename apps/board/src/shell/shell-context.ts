import type { BoardErrorBody, MeResponse } from '@ulti-project/shared';
import { createContext, useContext } from 'solid-js';

export type LiveStatus = 'live' | 'reconnecting';

export interface ShellContextValue {
  readonly me: MeResponse;
  /** Ask `/api/me` again, e.g. after a request was refused with 401 or 403. */
  readonly refetchMe: () => void;
  /** What the top bar says about the board's live stream; undefined hides it. */
  readonly setLiveStatus: (status: LiveStatus | undefined) => void;
}

export const ShellContext = createContext<ShellContextValue>();

export function useShell(): ShellContextValue {
  const shell = useContext(ShellContext);
  if (shell === undefined)
    throw new Error('useShell is used outside the shell');
  return shell;
}

/** Whether a refused request means the shell should re-check who's signed in. */
export function isAccessRefusal(result: {
  ok: false;
  status: number;
  body: BoardErrorBody;
}): boolean {
  return (
    result.status === 401 ||
    (result.status === 403 &&
      (result.body.reason === 'not-in-guild' ||
        result.body.reason === 'no-role'))
  );
}
