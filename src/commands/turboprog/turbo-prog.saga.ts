import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable, filter, map } from 'rxjs';
import { PartyStatus } from '../../firebase/models/signup.model.js';
import { SignupApprovedEvent } from '../signup/signup.events.js';
import { RemoveSignupEvent } from '../signup/subcommands/remove-signup/remove-signup.events.js';
import { TurboProgRemoveSignupCommand } from './turbo-prog.commands.js';

@Injectable()
class TurboProgSagas {
  @Saga()
  signupSubmitted = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovedEvent),
      filter(({ signup }) => signup.partyStatus === PartyStatus.Cleared),
      map(
        ({ signup: { character, encounter }, settings }) =>
          new TurboProgRemoveSignupCommand(
            {
              character,
              encounter,
            },
            settings,
          ),
      ),
    );

  @Saga()
  signupRemoved = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(RemoveSignupEvent),
      map(
        ({ dto: { character, encounter }, settings }) =>
          new TurboProgRemoveSignupCommand({ character, encounter }, settings),
      ),
    );
}

export { TurboProgSagas };
