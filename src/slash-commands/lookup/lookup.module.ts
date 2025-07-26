import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ErrorModule } from '../../error/error.module.js';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { LookupCommandHandler } from './lookup.command-handler.js';

@Module({
  imports: [CqrsModule, ErrorModule, FirebaseModule],
  providers: [LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
