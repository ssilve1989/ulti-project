import { Module } from '@nestjs/common';
import { SignupCommandHandler } from './handlers/signup-command.handler.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { SignupService } from './signup.service.js';

@Module({
  imports: [FirebaseModule],
  providers: [SignupCommandHandler, SignupService],
})
class SignupModule {}

export { SignupModule };
