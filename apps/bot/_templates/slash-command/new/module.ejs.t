---
to: src/slash-commands/<%=name%>/<%=name%>.module.ts
---
import { Module } from '@nestjs/common';
import { ErrorModule } from '../../error/error.module.js';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './handlers/<%=name%>.command-handler.js';

@Module({
  imports: [ErrorModule],
  providers: [<%= h.changeCase.pascal(name) %>CommandHandler],
})
class <%= h.changeCase.pascal(name) %>Module {}

export { <%= h.changeCase.pascal(name) %>Module };
