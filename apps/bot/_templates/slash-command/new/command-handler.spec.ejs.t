---
to: src/slash-commands/<%=name%>/handlers/<%=name%>.command-handler.spec.ts
---
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './<%=name%>.command-handler.js';

describe('<%=h.changeCase.pascal(name)%>CommandHandler', () => {
  let command: <%= h.changeCase.pascal(name) %>CommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [<%= h.changeCase.pascal(name) %>CommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(<%= h.changeCase.pascal(name) %>CommandHandler);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });
});
