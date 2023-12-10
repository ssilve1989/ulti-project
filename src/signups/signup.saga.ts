import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { SignupEvent } from './signup.events.js';
import { Observable, map } from 'rxjs';
import { SendSignupForApprovalCommand } from './signup.commands.js';

@Injectable()
class SignupSagas {
  @Saga()
  signupModified = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupEvent),
      map((event) => new SendSignupForApprovalCommand(event.signup)),
    );
}

export { SignupSagas };
