import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { BlacklistDisplayCommand } from '../../blacklist.commands.js';
import { createBlacklistEmbedFields } from '../../blacklist.utils.js';

@CommandHandler(BlacklistDisplayCommand)
class BlacklistDisplayCommandHandler
  implements ICommandHandler<BlacklistDisplayCommand>
{
  constructor(private readonly blacklistCollection: BlacklistCollection) {}

  async execute({ interaction }: BlacklistDisplayCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const results = await this.blacklistCollection.getBlacklist(
      interaction.guildId,
    );

    const fields = results.flatMap((result) =>
      createBlacklistEmbedFields(result),
    );

    // for each result create an Embed field item for it, only displaying the fields that are defined in the document
    const embed = new EmbedBuilder()
      .setTitle('Blacklist')
      .setDescription(`There are ${fields.length} users on the blacklist.`)
      .addFields(fields);

    await interaction.editReply({ embeds: [embed] });
  }
}

export { BlacklistDisplayCommandHandler };
