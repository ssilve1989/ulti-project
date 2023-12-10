import { Module } from '@nestjs/common';
import { SignupCommandHandler } from './handlers/signup-command.handler.js';
import { FirebaseModule } from '../firebase/firebase.module.js';
import { SignupService } from './signup.service.js';
import { CqrsModule } from '@nestjs/cqrs';
import { SignupSagas } from './signup.saga.js';
import { ClientModule } from '../client/client.module.js';
import { SendSignupForApprovalHandler } from './handlers/send-signup-for-approval.handler.js';
import { SignupApprovalService } from './signup-approval.service.js';

@Module({
  imports: [CqrsModule, FirebaseModule, ClientModule],
  providers: [
    SendSignupForApprovalHandler,
    SignupApprovalService,
    SignupCommandHandler,
    SignupSagas,
    SignupService,
  ],
})
class SignupModule {}

export { SignupModule };
