import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { BlacklistRemoveCommand } from '../../blacklist.commands.js';
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
    const { guildId, ...rest } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user', true);
    const entry = await this.blacklistCollection.remove(guildId, user.id);

    await interaction.editReply('Success!');

    if (entry) {
      this.eventBus.publish(
        new BlacklistUpdatedEvent({
          type: 'removed',
          entry,
          guildId,
          triggeredBy: rest.user,
        }),
      );
    }
  }
}

export { BlacklistRemoveCommandHandler };
