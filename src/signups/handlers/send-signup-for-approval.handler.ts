import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SignupApprovalService } from '../signup-approval.service.js';
import { SendSignupForApprovalCommand } from '../signup.commands.js';

@CommandHandler(SendSignupForApprovalCommand)
class SendSignupForApprovalHandler
  implements ICommandHandler<SendSignupForApprovalCommand>
{
  constructor(private readonly service: SignupApprovalService) {}

  execute({ signup }: SendSignupForApprovalCommand) {
    return this.service.sendSignupForApproval(signup);
  }
}

export { SendSignupForApprovalHandler };
