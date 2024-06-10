import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { LookupCommandHandler } from './lookup.command-handler.js';
import { LookupService } from './lookup.service.js';

@Module({
  imports: [CqrsModule, FirebaseModule],
  providers: [LookupService, LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
