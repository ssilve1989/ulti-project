import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { SheetsModule } from '../sheets/sheets.module.js';
import { TurboProgRemoveSignupHandler } from './commands/handlers/turbo-prog-remove-signup.command-handler.js';
import { TurboProgCommandHandler } from './commands/handlers/turbo-prog.command-handler.js';

@Module({
  imports: [SheetsModule, FirebaseModule, CqrsModule],
  providers: [TurboProgCommandHandler, TurboProgRemoveSignupHandler],
})
export class TurboProgModule {}
