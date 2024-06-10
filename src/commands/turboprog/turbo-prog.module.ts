import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SheetsModule } from '../../sheets/sheets.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TurboProgRemoveSignupHandler } from './handlers/turbo-prog-remove-signup.command-handler.js';
import { TurboProgCommandHandler } from './handlers/turbo-prog.command-handler.js';

@Module({
  imports: [SettingsModule, SheetsModule, FirebaseModule, CqrsModule],
  providers: [TurboProgCommandHandler, TurboProgRemoveSignupHandler],
})
export class TurboProgModule {}
