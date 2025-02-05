import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EmbedBuilder } from 'discord.js';
import { createFields } from '../../../../common/embed-helpers.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { getDisplayName } from '../../blacklist.utils.js';
import { BlacklistUpdatedEvent } from '../blacklist.events.js';

@EventsHandler(BlacklistUpdatedEvent)
class BlacklistUpdatedEventHandler
  implements IEventHandler<BlacklistUpdatedEvent>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
  ) {}

  async handle({
    data: { entry, type, guildId, triggeredBy },
  }: BlacklistUpdatedEvent) {
    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.modChannelId) {
      return;
    }

    const { modChannelId } = settings;

    const toFrom = type === 'added' ? 'to' : 'from';
    const displayName = await getDisplayName(this.discordService, {
      guildId,
      characterName: entry.characterName,
      discordId: entry.discordId,
    });

    const fields = createFields([
      {
        name: 'User',
        value: displayName,
        inline: true,
      },
      {
        name: 'Lodestone ID',
        value: entry.lodestoneId?.toString(),
        inline: true,
      },
    ]);

    if (type === 'added') {
      fields.push({ name: 'Reason', value: entry.reason, inline: true });
    }

    const triggeredByDisplayName = await this.discordService.getDisplayName({
      guildId,
      userId: triggeredBy.id,
    });

    const embed = new EmbedBuilder()
      .setTitle('Blacklist Updated')
      .setDescription(`A user has been ${type} ${toFrom} the Blacklist`)
      .setTimestamp()
      .setFooter({
        text: `Submitted by ${triggeredByDisplayName}`,
        iconURL: triggeredBy.displayAvatarURL(),
      })
      .addFields(fields);

    const channel = await this.discordService.getTextChannel({
      channelId: modChannelId,
      guildId,
    });

    await channel?.send({ embeds: [embed] });
  }
}

export { BlacklistUpdatedEventHandler };
