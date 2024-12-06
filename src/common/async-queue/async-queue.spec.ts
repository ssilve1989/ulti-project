import { AsyncQueue } from './async-queue.js';

describe('Async Queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('AsyncQueue should run tasks in order', async () => {
    const queue = new AsyncQueue();

    const task1 = vi.fn(async () => 'task1');
    const task2 = vi.fn(async () => 'task2');
    const task3 = vi.fn(async () => 'task3');

    const result1 = queue.add(task1);
    const result2 = queue.add(task2);
    const result3 = queue.add(task3);

    const results = await Promise.all([result1, result2, result3]);

    expect(results).toEqual(['task1', 'task2', 'task3']);
    expect(task1).toHaveBeenCalledBefore(task2);
    expect(task2).toHaveBeenCalledBefore(task3);
  });

  test('AsyncQueue should handle errors', async () => {
    expect.assertions(3);

    const queue = new AsyncQueue();

    const task1 = async () => {
      // workaround for vitest/sinon not supporting fakeTime on the node:timers/promises module
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'task1';
    };
    const task2 = async () => {
      throw new Error('task2 error');
    };

    const task3 = async () => 'task3';

    const result1 = queue.add(task1);
    const result2 = queue.add(task2);
    const result3 = queue.add(task3);

    vi.runAllTimers();

    await expect(result1).resolves.toBe('task1');
    await expect(result2).rejects.toThrow('task2 error');
    await expect(result3).resolves.toBe('task3');
  });
});
