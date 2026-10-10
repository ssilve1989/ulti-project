import { A } from '@solidjs/router';
import type { BoardEventSummary } from '@ulti-project/shared';
import { createResource, For, Match, Show, Switch } from 'solid-js';
import { api } from '../api/client';
import { formatStart } from '../format';
import { isAccessRefusal, useShell } from '../shell/shell-context';

/** `/`: the events that aren't closed, each linking to its board. */
export function EventList() {
  const { refetchMe } = useShell();
  const [result, { refetch }] = createResource(async () => {
    const answer = await api<BoardEventSummary[]>('/api/events');
    // The shell then shows the sign-in or no-access screen in place of this page.
    if (!answer.ok && isAccessRefusal(answer)) refetchMe();
    return answer;
  });

  const events = () => {
    const current = result();
    return current?.ok ? current.body : undefined;
  };
  const failed = () => {
    const current = result();
    return current?.ok === false && !isAccessRefusal(current);
  };

  return (
    <main class="event-list">
      <h1>Open events</h1>
      <Switch>
        <Match when={events()}>
          {(list) => (
            <Show when={list().length > 0} fallback={<p>No open events.</p>}>
              <ul>
                <For each={list()}>
                  {(event) => (
                    <li>
                      <A href={`/events/${event.id}`}>
                        <span class="event-title">{event.title}</span>
                        <time datetime={event.startsAt}>
                          {formatStart(event.startsAt)}
                        </time>
                        <span class="chips">
                          <For each={event.encounters}>
                            {(encounter) => (
                              <span class="chip">{encounter}</span>
                            )}
                          </For>
                        </span>
                        <span class="event-count">
                          {event.participantCount} signed up
                        </span>
                      </A>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </Match>
        <Match when={failed()}>
          <p>Couldn't load events.</p>
          <button type="button" onClick={() => void refetch()}>
            Try again
          </button>
        </Match>
      </Switch>
    </main>
  );
}
