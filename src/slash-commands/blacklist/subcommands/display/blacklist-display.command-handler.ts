import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { BlacklistSlashCommand } from '../../blacklist.slash-command.js';
import { createBlacklistEmbedFields } from '../../blacklist.utils.js';

@Injectable()
@SlashCommand({ builder: BlacklistSlashCommand, subcommand: 'display' })
class BlacklistDisplayCommandHandler implements ISlashCommand {
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly discordService: DiscordService,
  ) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const results = await this.blacklistCollection.getBlacklist(
      interaction.guildId,
    );

    const fields = await Promise.all(
      results.map((result) =>
        createBlacklistEmbedFields(
          this.discordService,
          result,
          interaction.guildId,
        ),
      ),
    );

    // for each result create an Embed field item for it, only displaying the fields that are defined in the document
    const embed = new EmbedBuilder()
      .setTitle('Blacklist')
      .setDescription(`There are ${results.length} users on the blacklist.`)
      .addFields(fields.flat());

    await interaction.editReply({ embeds: [embed] });
  }
}

export { BlacklistDisplayCommandHandler };
