import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import type { BlacklistDocument } from '../../../../firebase/models/blacklist.model.js';
import { BlacklistAddCommand } from '../../blacklist.commands.js';
import { getDiscordId } from '../../blacklist.utils.js';
import { BlacklistUpdatedEvent } from '../../events/blacklist.events.js';

@CommandHandler(BlacklistAddCommand)
class BlacklistAddCommandHandler
  implements ICommandHandler<BlacklistAddCommand>
{
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ interaction }: BlacklistAddCommand) {
    const { guildId, user } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordId = getDiscordId(interaction);
    const characterName = interaction.options.getString('character');
    const lodestoneId = interaction.options.getInteger('lodestone-id');
    const reason = interaction.options.getString('reason', true);

    const props: BlacklistDocument = {
      discordId,
      characterName: characterName?.toLowerCase() ?? null,
      reason,
      lodestoneId,
    };

    const entry = await this.blacklistCollection.upsert(guildId, props);
    await interaction.editReply('Successfully added to blacklist!');

    this.eventBus.publish(
      new BlacklistUpdatedEvent({
        type: 'added',
        entry,
        guildId,
        triggeredBy: user,
      }),
    );
  }
}

export { BlacklistAddCommandHandler };
