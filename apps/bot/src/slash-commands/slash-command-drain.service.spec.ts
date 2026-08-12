import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  SlashCommandDrainService,
} from './slash-command-drain.service.js';

describe('SlashCommandDrainService', () => {
  let service: SlashCommandDrainService;

  beforeEach(async () => {
    vi.useFakeTimers();

    const fixture = await Test.createTestingModule({
      providers: [SlashCommandDrainService],
    }).compile();

    service = fixture.get(SlashCommandDrainService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not draining before shutdown begins', () => {
    expect(service.isDraining()).toBe(false);
  });

  it('flips to draining synchronously when onModuleDestroy is called', () => {
    void service.onModuleDestroy();

    expect(service.isDraining()).toBe(true);
  });

  it('resolves immediately when nothing is in flight', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('waits for a tracked promise to settle before resolving', async () => {
    let resolveTask!: () => void;
    const task = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    service.track(task);

    let destroyed = false;
    const destroyPromise = service.onModuleDestroy().then(() => {
      destroyed = true;
    });

    // let the synchronous part of onModuleDestroy run without resolving anything
    await Promise.resolve();
    await Promise.resolve();
    expect(destroyed).toBe(false);

    resolveTask();
    await destroyPromise;

    expect(destroyed).toBe(true);
  });

  it('resolves after the timeout even if a tracked promise never settles', async () => {
    const straggler = new Promise<void>(() => {
      // never resolves
    });
    service.track(straggler);

    const destroyPromise = service.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_TIMEOUT_MS);

    await expect(destroyPromise).resolves.toBeUndefined();
  });

  it('treats a rejected tracked promise as settled and does not throw', async () => {
    const failing = Promise.reject(new Error('boom'));
    service.track(failing).catch(() => {
      // caller is expected to handle rejection; drain must not hang or throw
    });

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('removes a tracked promise from the in-flight set once it settles', async () => {
    const task = Promise.resolve('done');
    service.track(task);
    await task;

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
