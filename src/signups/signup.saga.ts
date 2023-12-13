import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { SignupEvent, SignupReviewCreatedEvent } from './signup.events.js';
import { Observable, map } from 'rxjs';
import { UpdateSignupReviewCommand } from './commands/update-signup-review.command.js';
import { SendSignupReviewCommand } from './commands/send-signup-review.command.js';

@Injectable()
class SignupSagas {
  /**
   * When a signup event is created, dispatch a command that sends a signup to a designated channel for review
   * @param event$
   * @returns
   */
  @Saga()
  signupModified = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupEvent),
      map((event) => new SendSignupReviewCommand(event.signup)),
    );

  /**
   * When a signup review is created, dispatch a command that updates the firestore with the message id that correlates to the signup
   * @param event$
   * @returns
   */
  @Saga()
  signupReviewSend = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupReviewCreatedEvent),
      map(
        ({ signup, messageId }) =>
          new UpdateSignupReviewCommand(signup, messageId),
      ),
    );
}

export { SignupSagas };
