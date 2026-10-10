import { cleanup } from '@solidjs/testing-library';
import { afterEach, vi } from 'vitest';

// jsdom hides a closed popover but can't open one: open it as a browser does,
// on a click of its popovertarget button.
if (
  globalThis.HTMLElement &&
  !Reflect.has(HTMLElement.prototype, 'togglePopover')
) {
  HTMLElement.prototype.togglePopover = function (this: HTMLElement) {
    const open = this.style.display !== 'block';
    this.style.display = open ? 'block' : '';
    return open;
  };
  document.addEventListener('click', (event) => {
    const invoker =
      event.target instanceof Element
        ? event.target.closest('[popovertarget]')
        : null;
    const id = invoker?.getAttribute('popovertarget');
    if (id) document.getElementById(id)?.togglePopover();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // node-environment specs have no localStorage
  globalThis.localStorage?.clear();
  globalThis.document?.documentElement.removeAttribute('data-theme');
});
