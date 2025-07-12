import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { HelpCommandHandler } from './help.command-handler.js';

@Module({
  imports: [CqrsModule],
  providers: [HelpCommandHandler],
})
class HelpModule {}

export { HelpModule };
