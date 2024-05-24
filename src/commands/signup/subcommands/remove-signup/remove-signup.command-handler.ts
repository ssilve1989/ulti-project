import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { plainToClass } from 'class-transformer';
import { APIUser, ChatInputCommandInteraction, User } from 'discord.js';
import { P, match } from 'ts-pattern';
import { DiscordService } from '../../../../discord/discord.service.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../../../../firebase/firebase.exceptions.js';
import {
  SignupCompositeKeyProps,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { shouldDeleteReviewMessageForSignup } from '../../signup.utils.js';
import { RemoveSignupCommand } from './remove-signup.command.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_NO_DB_ENTRY,
  REMOVAL_NO_SHEET_ENTRY,
  REMOVAL_SUCCESS,
} from './remove-signup.consts.js';
import { RemoveSignupDto } from './remove-signup.dto.js';

@CommandHandler(RemoveSignupCommand)
class RemoveSignupCommandHandler
  implements ICommandHandler<RemoveSignupCommand>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly signupsRepository: SignupCollection,
  ) {}

  async execute({ interaction }: RemoveSignupCommand): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const options = {
      ...this.getOptions(interaction),
      discordId: interaction.user.id,
    };

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply(SIGNUP_MESSAGES.MISSING_SETTINGS);
    }

    const { spreadsheetId, reviewerRole } = settings;

    try {
      const { canModify, signup } = await this.canModifySignup(
        interaction.user,
        options,
        interaction.guildId,
        reviewerRole,
      );

      if (!canModify) {
        return interaction.editReply(REMOVAL_MISSING_PERMISSIONS);
      }

      let reply = REMOVAL_SUCCESS;

      // If the signup exists and has been approved, we expect to find it on the sheet
      // so try to remove it
      if (spreadsheetId && signup.status === SignupStatus.APPROVED) {
        const response = await this.sheetsService.removeSignup(
          options,
          spreadsheetId,
        );

        // but if nothing was found on the sheet just let them know nothing was found
        if (response === 0) {
          reply = REMOVAL_NO_SHEET_ENTRY(options);
        }
      }

      await this.removeSignup(options, interaction.guildId);
      await interaction.editReply(reply);
    } catch (error) {
      match(error)
        .with(P.instanceOf(DocumentNotFoundException), () =>
          this.handleDocumentNotFoundException(interaction, options),
        )
        .otherwise(() => {
          throw error;
        });
    }
  }

  private async removeSignup(
    dto: RemoveSignupDto & { discordId: string },
    guildId: string,
  ) {
    const signup = await this.signupsRepository.findOne(dto);

    if (!signup) {
      return;
    }

    // if there is an existing signup check if the approval was already handled
    // if it has not been, remove it.
    if (shouldDeleteReviewMessageForSignup(signup)) {
      const reviewChannelId =
        await this.settingsCollection.getReviewChannel(guildId);
      if (reviewChannelId && signup.reviewMessageId) {
        await this.discordService.deleteMessage(
          guildId,
          reviewChannelId,
          signup.reviewMessageId,
        );
      }
    }

    await this.signupsRepository.removeSignup(dto);
  }

  private getOptions({ options }: ChatInputCommandInteraction) {
    return plainToClass(RemoveSignupDto, {
      character: options.getString('character')!,
      world: options.getString('world')!,
      encounter: options.getString('encounter')! as Encounter,
    });
  }

  private async canModifySignup(
    user: User | APIUser,
    options: SignupCompositeKeyProps,
    guildId: string,
    reviewerRole = '',
  ) {
    const hasRole = await this.discordService.userHasRole({
      userId: user.id,
      roleId: reviewerRole,
      guildId,
    });

    const signup = await this.signupsRepository.findOneOrFail(options);
    return { canModify: hasRole || signup.discordId === user.id, signup };
  }

  private async handleDocumentNotFoundException(
    interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    options: RemoveSignupDto,
  ) {
    await interaction.editReply(REMOVAL_NO_DB_ENTRY(options));
  }
}

export { RemoveSignupCommandHandler };
