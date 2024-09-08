import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type APIEmbedField, EmbedBuilder } from 'discord.js';
import { BlacklistCollection } from '../../../firebase/collections/blacklist-collection.js';
import type { BlacklistDocument } from '../../../firebase/models/blacklist.model.js';
import { BlacklistDisplayCommand } from '../../blacklist.commands.js';
import { getDisplayName } from '../../blacklist.utils.js';

@CommandHandler(BlacklistDisplayCommand)
class BlacklistDisplayCommandHandler
  implements ICommandHandler<BlacklistDisplayCommand>
{
  constructor(private readonly blacklistCollection: BlacklistCollection) {}

  async execute({ interaction }: BlacklistDisplayCommand) {
    await interaction.deferReply({ ephemeral: true });

    const results = await this.blacklistCollection.getBlacklist(
      interaction.guildId,
    );

    const fields = results.flatMap((result) => this.getFields(result));

    // for each result create an Embed field item for it, only displaying the fields that are defined in the document
    const embed = new EmbedBuilder().setTitle('Blacklist').addFields(fields);

    await interaction.editReply({ embeds: [embed] });
  }

  private getFields({
    characterName,
    discordId,
    reason,
  }: BlacklistDocument): APIEmbedField[] {
    const displayName = getDisplayName({ characterName, discordId });
    return [
      { name: 'Player', value: displayName, inline: true },
      { name: 'Reason', value: reason, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    ];
  }
}

export { BlacklistDisplayCommandHandler };
