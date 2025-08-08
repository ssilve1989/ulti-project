import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

describe('RemoveRoleCommandHandler', () => {
  let handler: RemoveRoleCommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveRoleCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .compile();

    handler = fixture.get(RemoveRoleCommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
