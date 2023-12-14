import { Module } from '@nestjs/common';
import { SettingsCommandHandler } from './commands/handlers/settings-command.handler.js';
import { SettingsService } from './settings.service.js';
import { FirebaseModule } from '../firebase/firebase.module.js';

@Module({
  imports: [FirebaseModule],
  providers: [SettingsCommandHandler, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
