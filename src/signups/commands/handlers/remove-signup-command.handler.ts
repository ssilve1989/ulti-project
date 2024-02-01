import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RemoveSignupCommand } from '../remove-signup.command.js';
import { ChatInputCommandInteraction } from 'discord.js';
import { Encounter } from '../../../app.consts.js';
import { SignupRepository } from '../../signup.repository.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { SettingsService } from '../../../settings/settings.service.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';

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

    const options = this.getOptions(interaction);

    const settings = await this.settingsService.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply(SIGNUP_MESSAGES.MISSING_SETTINGS);
    }

    const { spreadsheetId, reviewerRole } = settings;

    // TODO: Abstract into some authorization mechanism?
    if (reviewerRole) {
      const {
        member: { user },
      } = interaction;

      const hasRole = await this.discordService.userHasRole(
        user.id,
        reviewerRole,
      );

      if (!hasRole) {
        return interaction.editReply(
          'You do not have permission to remove signups',
        );
      }
    } else {
      return interaction.editReply(
        'No role has been configured to be allowed to run this command.',
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
}

export { RemoveSignupCommandHandler };
