import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { SignupsController } from './signups.controller.js';

@Module({
  imports: [FirebaseModule],
  controllers: [SignupsController],
})
export class SignupsModule {}
