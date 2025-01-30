import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { DiscordService } from '../discord/discord.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';

@Injectable()
class RoleManagerService {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
  ) {}

  /**
   * Validates if the user has the required role
   * @param interaction
   * @param requiredRoleKey
   * @returns
   */
  async validateRole(
    interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    requiredRoleKey: string,
  ): Promise<boolean> {
    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const roleId = settings?.[requiredRoleKey];

    if (!roleId) {
      return false;
    }

    return this.discordService.userHasRole({
      userId: interaction.user.id,
      roleId,
      guildId: interaction.guildId,
    });
  }
}

export { RoleManagerService };
