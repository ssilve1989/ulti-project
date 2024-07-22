---
to: src/<%=name%>/<%=name%>.module.ts
---

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { <%= h.changeCase.pascal(name) %>Service } from './<%= name %>.service.js';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './<%= h.changeCase.pascal(name) %>.command-handler.js';

@Module({
  imports: [CqrsModule],
  providers: [<%= h.changeCase.pascal(name) %>Service, <%= h.changeCase.pascal(name) %>CommandHandler],
})
class <%= h.changeCase.pascal(name) %>Module {}

export { <%= h.changeCase.pascal(name) %>Module };
