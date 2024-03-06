---
to: src/commands/<%=name%>/<%=name%>.command-handler.ts
---
import { CommandHandler } from '@nestjs/cqrs';
import { <%= Name %>Command } from './<%=name%>.command.js';

@CommandHandler(<%= Name %>Command)
class <%= Name %>CommandHandler implements ICommandHandler<<%= Name %>Command> {}

export { <%= Name %>CommandHandler };
