---
to: src/<%=name%>/<%=name%>.command-handler.ts
---
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { <%= h.changeCase.pascal(name) %>Command } from './<%=name%>.command.js';

@CommandHandler(<%= h.changeCase.pascal(name) %>Command)
class <%= h.changeCase.pascal(name) %>CommandHandler implements ICommandHandler<<%= h.changeCase.pascal(name) %>Command> {
  execute(command: <%= h.changeCase.pascal(name) %>Command): Promise<any> {
    throw new Error('Method not implemented.');
  }
}

export { <%= h.changeCase.pascal(name) %>CommandHandler };
