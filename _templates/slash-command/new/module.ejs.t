---
to: src/slash-commands/<%=name%>/<%=name%>.module.ts
---
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ErrorModule } from '../../error/error.module.js';
import { SlashCommandsSharedModule } from '../shared/slash-commands-shared.module.js';
import { <%= h.changeCase.pascal(name) %>CommandHandler } from './<%=name%>.command-handler.js';

@Module({
  imports: [CqrsModule, ConfigModule, ErrorModule, SlashCommandsSharedModule],
  providers: [<%= h.changeCase.pascal(name) %>CommandHandler],
})
class <%= h.changeCase.pascal(name) %>Module {}

export { <%= h.changeCase.pascal(name) %>Module };
