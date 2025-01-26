import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { BlacklistRemoveCommand } from '../../blacklist.commands.js';
import { getDiscordId } from '../../blacklist.utils.js';
import { BlacklistUpdatedEvent } from '../../events/blacklist.events.js';

@CommandHandler(BlacklistRemoveCommand)
class BlacklistRemoveCommandHandler
  implements ICommandHandler<BlacklistRemoveCommand>
{
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ interaction }: BlacklistRemoveCommand) {
    const { guildId, user } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordId = getDiscordId(interaction);
    const characterName = interaction.options.getString('character');
    const lodestoneId = interaction.options.getInteger('lodestone-id');

    const entry = await this.blacklistCollection.remove(guildId, {
      discordId,
      characterName: characterName?.toLowerCase() ?? null,
      lodestoneId,
    });

    await interaction.editReply('Success!');

    if (entry) {
      this.eventBus.publish(
        new BlacklistUpdatedEvent({
          type: 'removed',
          entry,
          guildId,
          triggeredBy: user,
        }),
      );
    }
  }
}

export { BlacklistRemoveCommandHandler };
