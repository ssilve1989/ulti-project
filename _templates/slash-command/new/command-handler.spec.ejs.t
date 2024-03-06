---
to: src/commands/<%=name%>/<%=name%>.command-handler.spec.ts
---
import { Test } from '@nestjs/testing';
import { <%= Name %>CommandHandler } from './<%=name%>.command-handler.js';
import { createMock } from '../../test/create-mock.js';

describe("<%=Name%>CommandHandler", () => {
  let handler: <%= Name %>CommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [<%= Name %>CommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(<%= Name %>CommandHandler);  
  })

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
