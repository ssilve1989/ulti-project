import { Injectable } from '@nestjs/common';
import { type ICommand, Saga, ofType } from '@nestjs/cqrs';
import { Observable, filter, map, mergeMap } from 'rxjs';
import { BlacklistSearchCommand } from './slash-commands/blacklist/blacklist.commands.js';
import { RemoveRolesCommand } from './slash-commands/signup/commands/signup.commands.js';
import {
  SignupApprovedEvent,
  SignupCreatedEvent,
} from './slash-commands/signup/events/signup.events.js';
import { hasClearedStatus } from './slash-commands/signup/signup.utils.js';
import { RemoveSignupEvent } from './slash-commands/signup/subcommands/remove-signup/remove-signup.events.js';
import { SendSignupReviewCommand } from './slash-commands/signup/subcommands/send-signup-review/send-signup-review.command.js';
import { TurboProgRemoveSignupCommand } from './slash-commands/turboprog/commands/turbo-prog.commands.js';

// TODO: Why are these at the app level? They should be in the signup module
@Injectable()
class AppSagas {
  /**
   * When a signup event is created, dispatch a command that sends a signup to a designated channel for review
   * @param event$
   * @returns
   */
  @Saga()
  handleSignupCreated = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupCreatedEvent),
      mergeMap(({ signup, guildId }) => [
        new SendSignupReviewCommand(signup, guildId),
        new BlacklistSearchCommand(signup, guildId),
      ]),
    );

  /**
   * When a signup is approved, check if it has cleared status and remove roles if it does
   * Additionally will dispatch a command to clear the signup from the TurboProg sheet
   * @param event$
   * @returns
   */
  @Saga()
  handleClearedSignup = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovedEvent),
      filter(({ signup }) => hasClearedStatus(signup)),
      mergeMap(({ signup, message, settings }) => [
        new RemoveRolesCommand(
          message.guildId,
          signup.discordId,
          signup.encounter,
          settings,
        ),
        new TurboProgRemoveSignupCommand(
          {
            character: signup.character,
            encounter: signup.encounter,
          },
          settings,
        ),
      ]),
    );

  /**
   * When a signup is removed, dispatch a command to remove it from the TurboProg sheet
   * @param event$
   * @returns
   */
  @Saga()
  handleSignupRemoved = (event$: Observable<any>): Observable<ICommand> =>
    event$.pipe(
      ofType(RemoveSignupEvent),
      map(
        // TODO: Should also remove roles probably
        ({ dto: { character, encounter }, settings }) =>
          new TurboProgRemoveSignupCommand({ character, encounter }, settings),
      ),
    );
}

export { AppSagas };
