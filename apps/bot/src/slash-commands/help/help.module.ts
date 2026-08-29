import { Module } from '@nestjs/common';
import { ErrorModule } from '../../error/error.module.js';
import { HelpCommandHandler } from './handlers/help.command-handler.js';

@Module({
  imports: [ErrorModule],
  providers: [HelpCommandHandler],
})
class HelpModule {}

export { HelpModule };
