import { Injectable } from '@nestjs/common';
import { type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs';
import { filter, map, mergeMap, Observable } from 'rxjs';
import { BlacklistSearchCommand } from './slash-commands/blacklist/blacklist.commands.js';
import { RemoveRolesCommand } from './slash-commands/signup/commands/signup.commands.js';
import {
  SignupApprovalSentEvent,
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
  handleSignupCreated = (event$: Observable<IEvent>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupCreatedEvent),
      map(
        ({ signup, guildId }) => new SendSignupReviewCommand(signup, guildId),
      ),
    );

  /**
   * When a signup is approved, check if it has cleared status and remove roles if it does
   * Additionally will dispatch a command to clear the signup from the TurboProg sheet
   * @param event$
   * @returns
   */
  @Saga()
  handleClearedSignup = (event$: Observable<IEvent>): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovedEvent),
      filter(({ signup }) => hasClearedStatus(signup)),
      mergeMap(({ signup, message }) => [
        new RemoveRolesCommand(
          message.guildId,
          signup.discordId,
          signup.encounter,
        ),
        new TurboProgRemoveSignupCommand(
          {
            character: signup.character,
            encounter: signup.encounter,
          },
          message.guildId,
        ),
      ]),
    );

  /**
   * When a signup is removed, dispatch a command to remove it from the TurboProg sheet
   * @param event$
   * @returns
   */
  @Saga()
  handleSignupRemoved = (event$: Observable<IEvent>): Observable<ICommand> =>
    event$.pipe(
      ofType(RemoveSignupEvent),
      mergeMap(
        ({ dto: { character, encounter }, ids: { discordId, guildId } }) => [
          new RemoveRolesCommand(guildId, discordId, encounter),
          new TurboProgRemoveSignupCommand({ character, encounter }, guildId),
        ],
        10,
      ),
    );

  @Saga()
  handleSignupApprovalSend = (
    event$: Observable<IEvent>,
  ): Observable<ICommand> =>
    event$.pipe(
      ofType(SignupApprovalSentEvent),
      map(({ guildId, signup }) => new BlacklistSearchCommand(signup, guildId)),
    );
}

export { AppSagas };
