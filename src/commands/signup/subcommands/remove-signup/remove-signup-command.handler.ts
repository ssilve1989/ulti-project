import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { APIUser, ChatInputCommandInteraction, User } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import { SignupCompositeKeyProps } from '../../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { RemoveSignupCommand } from './remove-signup.command.js';

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

    const canModify = await this.canModifySignup(
      interaction.user,
      options,
      interaction.guildId,
      reviewerRole,
    );

    if (!canModify) {
      return interaction.editReply(
        'You do not have permission to remove this signup',
      );
    }

    if (spreadsheetId) {
      await this.sheetsService.removeSignup(options, spreadsheetId);
    }

    const { discordId } = await this.signupsRepository.removeSignup(options);

    const roleId = settings.progRoles?.[options.encounter];

    if (roleId) {
      await this.discordService.removeRole({
        guildId: interaction.guildId,
        roleId,
        userId: discordId,
      });
    }

    await interaction.editReply('Signup removed');
  }

  private getOptions({ options }: ChatInputCommandInteraction) {
    return {
      character: options.getString('character')!,
      world: options.getString('world')!,
      encounter: options.getString('encounter')! as Encounter,
    };
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

    if (hasRole) return true;

    const signup = await this.signupsRepository.findOne(options);

    return signup.discordId === user.id;
  }
}

export { RemoveSignupCommandHandler };
