---
to: src/slash-commands/<%=name%>/<%=name%>.command-handler.spec.ts
---
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './<%=name%>.command-handler.js';

describe('<%=h.changeCase.pascal(name)%>CommandHandler', () => {
  let handler: <%= h.changeCase.pascal(name) %>CommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [<%= h.changeCase.pascal(name) %>CommandHandler],
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

    handler = fixture.get(<%= h.changeCase.pascal(name) %>CommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
