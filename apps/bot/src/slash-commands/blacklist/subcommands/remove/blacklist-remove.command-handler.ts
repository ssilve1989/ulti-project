import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { BlacklistCollection } from '#src/firebase/collections/blacklist-collection.js';
import { BlacklistSlashCommand } from '#src/slash-commands/blacklist/blacklist.slash-command.js';
import { BlacklistUpdatedEvent } from '#src/slash-commands/blacklist/events/blacklist.events.js';
import { SlashCommand } from '#src/slash-commands/slash-command.decorator.js';
import type { ISlashCommand } from '#src/slash-commands/slash-command.interface.js';

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
