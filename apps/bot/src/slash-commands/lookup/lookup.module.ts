import { Module } from '@nestjs/common';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { LookupCommandHandler } from './handlers/lookup.command-handler.js';

@Module({
  imports: [ErrorModule, FirebaseModule],
  providers: [LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
