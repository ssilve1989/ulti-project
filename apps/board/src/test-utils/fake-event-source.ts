import type { BoardStreamMessage } from '@ulti-project/shared';
import { vi } from 'vitest';

/** The slice of `EventSource` the board uses, driven by the test. */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  // A closed EventSource delivers nothing more.
  open(): void {
    if (this.closed) return;
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  send(message: BoardStreamMessage): void {
    if (this.closed) return;
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(message) }),
    );
  }

  /** The server ended the stream; the browser retries by itself. */
  drop(): void {
    if (this.closed) return;
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.(new Event('error'));
  }

  /** The connection was refused (401/403/404 before the stream) or the server is down. */
  refuse(): void {
    if (this.closed) return;
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.(new Event('error'));
  }
}

/** Stubs `EventSource`; returns the sources opened in this test, oldest first. */
export function installFakeEventSource(): readonly FakeEventSource[] {
  const sources: FakeEventSource[] = [];
  vi.stubGlobal(
    'EventSource',
    class extends FakeEventSource {
      constructor(url: string | URL) {
        super(url);
        sources.push(this);
      }
    },
  );
  return sources;
}
