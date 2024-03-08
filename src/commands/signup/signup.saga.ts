import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable, map } from 'rxjs';
import { SignupCreatedEvent } from './signup.events.js';
import { SendSignupReviewCommand } from './subcommands/send-signup-review/send-signup-review.command.js';

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
      ofType(SignupCreatedEvent),
      map(
        ({ signup, guildId }) => new SendSignupReviewCommand(signup, guildId),
      ),
    );
}

export { SignupSagas };
