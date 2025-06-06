import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { LookupCommandHandler } from './lookup.command-handler.js';

@Module({
  imports: [CqrsModule, FirebaseModule],
  providers: [LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
