import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RemoveSignupCommand } from '../remove-signup.command.js';
import { APIUser, ChatInputCommandInteraction, User } from 'discord.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { SignupRepository } from '../../signup.repository.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { SettingsService } from '../../../settings/settings.service.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { SignupCompositeKeyProps } from '../../signup.interfaces.js';

@CommandHandler(RemoveSignupCommand)
class RemoveSignupCommandHandler
  implements ICommandHandler<RemoveSignupCommand>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsService: SettingsService,
    private readonly sheetsService: SheetsService,
    private readonly signupsRepository: SignupRepository,
  ) {}

  async execute({ interaction }: RemoveSignupCommand): Promise<any> {
    await interaction.deferReply({ ephemeral: true });

    const options = {
      ...this.getOptions(interaction),
      discordId: interaction.user.id,
    };

    const settings = await this.settingsService.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply(SIGNUP_MESSAGES.MISSING_SETTINGS);
    }

    const { spreadsheetId, reviewerRole } = settings;

    const canModify = await this.canModifySignup(
      interaction.user,
      options,
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

    await this.signupsRepository.removeSignup(options);

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
    reviewerRole: string = '',
  ) {
    const hasRole = await this.discordService.userHasRole(
      user.id,
      reviewerRole,
    );

    if (hasRole) return true;

    const signup = await this.signupsRepository.findOne(options);

    return signup.discordId === user.id;
  }
}

export { RemoveSignupCommandHandler };
