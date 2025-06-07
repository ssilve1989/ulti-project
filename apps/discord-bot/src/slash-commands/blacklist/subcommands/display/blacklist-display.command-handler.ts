import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { BlacklistDisplayCommand } from '../../blacklist.commands.js';
import { createBlacklistEmbedFields } from '../../blacklist.utils.js';

@CommandHandler(BlacklistDisplayCommand)
class BlacklistDisplayCommandHandler
  implements ICommandHandler<BlacklistDisplayCommand>
{
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly discordService: DiscordService,
  ) {}

  async execute({ interaction }: BlacklistDisplayCommand) {
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
