import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { BlacklistSlashCommand } from '../../blacklist.slash-command.js';
import { BlacklistUpdatedEvent } from '../../events/blacklist.events.js';

@Injectable()
@SlashCommand({ builder: BlacklistSlashCommand, subcommand: 'remove' })
class BlacklistRemoveCommandHandler implements ISlashCommand {
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
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
