import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { BlacklistCollection } from '../../../../firebase/collections/blacklist-collection.js';
import type { BlacklistDocument } from '../../../../firebase/models/blacklist.model.js';
import { BlacklistAddCommand } from '../../blacklist.commands.js';
import { BlacklistUpdatedEvent } from '../../events/blacklist.events.js';

@CommandHandler(BlacklistAddCommand)
class BlacklistAddCommandHandler
  implements ICommandHandler<BlacklistAddCommand>
{
  constructor(
    private readonly blacklistCollection: BlacklistCollection,
    private readonly eventBus: EventBus,
    private readonly discordService: DiscordService,
  ) {}

  async execute({ interaction }: BlacklistAddCommand) {
    const { guildId, ...rest } = interaction;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user', true);
    const characterOverride = interaction.options.getString('character');
    const lodestoneId = interaction.options.getInteger('lodestone-id');
    const reason = interaction.options.getString('reason', true);

    const discordId = user.id;
    const member = await this.discordService.getGuildMember({
      memberId: discordId,
      guildId,
    });

    const characterName =
      characterOverride ?? member?.displayName ?? 'Unknown Character Name';

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
        triggeredBy: rest.user,
      }),
    );
  }
}

export { BlacklistAddCommandHandler };
