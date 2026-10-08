import { Module } from '@nestjs/common';
import { ErrorModule } from '#src/error/error.module.js';
import { FirebaseModule } from '#src/firebase/firebase.module.js';
import { LookupCommandHandler } from './handlers/lookup.command-handler.js';

@Module({
  imports: [ErrorModule, FirebaseModule],
  providers: [LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
