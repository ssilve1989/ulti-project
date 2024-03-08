import { CqrsModule } from '@nestjs/cqrs';
import { LookupService } from './lookup.service.js';
import { LookupCommandHandler } from './lookup.command-handler.js';
import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';

@Module({
  imports: [CqrsModule, FirebaseModule],
  providers: [LookupService, LookupCommandHandler],
})
class LookupModule {}

export { LookupModule };
