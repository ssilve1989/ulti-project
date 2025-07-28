---
to: src/slash-commands/<%=name%>/<%=name%>.command-handler.spec.ts
---
import { Test } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-vitest';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './<%=name%>.command-handler.js';

describe('<%=h.changeCase.pascal(name)%>CommandHandler', () => {
  let handler: <%= h.changeCase.pascal(name) %>CommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [<%= h.changeCase.pascal(name) %>CommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(<%= h.changeCase.pascal(name) %>CommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
