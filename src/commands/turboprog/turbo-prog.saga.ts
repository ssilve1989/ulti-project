import { Injectable } from '@nestjs/common';
import { ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable, filter, map } from 'rxjs';
import { PartyStatus } from '../../firebase/models/signup.model.js';
import {
  SignupApprovedEvent,
  SignupCreatedEvent,
} from '../signup/signup.events.js';
import { TurboProgRemoveSignupCommand } from './turbo-prog.commands.js';

@Injectable()
class TurboProgSagas {
  @Saga()
  signupSubmitted = (
    event$: Observable<SignupCreatedEvent>,
  ): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovedEvent),
      filter(({ signup }) => signup.partyStatus === PartyStatus.Cleared),
      map(
        ({
          guildId,
          signup: {
            progPoint,
            progPointRequested,
            availability,
            role,
            character,
            encounter,
          },
          settings,
        }) =>
          new TurboProgRemoveSignupCommand(
            {
              availability,
              character,
              encounter,
              job: role,
              progPoint: progPoint ?? progPointRequested,
            },
            guildId,
            settings,
          ),
      ),
    );
}

export { TurboProgSagas };
