import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable, filter, map } from 'rxjs';
import { PartyStatus } from '../../firebase/models/signup.model.js';
import { RemoveRolesCommand } from './signup.commands.js';
import { SignupApprovedEvent, SignupCreatedEvent } from './signup.events.js';
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

  @Saga()
  signupCleared = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovedEvent),
      filter(
        ({ signup }) =>
          signup.partyStatus === PartyStatus.Cleared ||
          signup.partyType === PartyStatus.Cleared,
      ),
      map(
        ({ signup: { encounter, discordId }, message, settings }) =>
          new RemoveRolesCommand(
            message.guildId,
            discordId,
            encounter,
            settings,
          ),
      ),
    );
}

export { SignupSagas };
