import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EmbedBuilder } from 'discord.js';
import { createFields } from '#src/common/embed-helpers.js';
import { DiscordService } from '#src/discord/discord.service.js';
import { SettingsCollection } from '#src/firebase/collections/settings-collection.js';
import { getBlacklistChannelIds } from '#src/firebase/models/settings.model.js';
import {
  getDisplayName,
  sendToBlacklistChannels,
} from '#src/slash-commands/blacklist/blacklist.utils.js';
import { BlacklistUpdatedEvent } from '#src/slash-commands/blacklist/events/blacklist.events.js';

@EventsHandler(BlacklistUpdatedEvent)
class BlacklistUpdatedEventHandler
  implements IEventHandler<BlacklistUpdatedEvent>
{
  private readonly logger = new Logger(BlacklistUpdatedEventHandler.name);

  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
  ) {}

  async handle({
    data: { entry, type, guildId, triggeredBy },
  }: BlacklistUpdatedEvent) {
    const settings = await this.settingsCollection.getSettings(guildId);
    const channelIds = getBlacklistChannelIds(settings);

    if (channelIds.length === 0) {
      return;
    }

    const toFrom = type === 'added' ? 'to' : 'from';
    const [displayName, triggeredByDisplayName] = await Promise.all([
      getDisplayName(this.discordService, {
        guildId,
        characterName: entry.characterName,
        discordId: entry.discordId,
      }),
      this.discordService.getDisplayName({
        guildId,
        userId: triggeredBy.id,
      }),
    ]);

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

    const embed = new EmbedBuilder()
      .setTitle('Blacklist Updated')
      .setDescription(`A user has been ${type} ${toFrom} the Blacklist`)
      .setTimestamp()
      .setFooter({
        text: `Submitted by ${triggeredByDisplayName}`,
        iconURL: triggeredBy.displayAvatarURL(),
      })
      .addFields(fields);

    await sendToBlacklistChannels(this.discordService, this.logger, {
      guildId,
      channelIds,
      embed,
    });
  }
}

export { BlacklistUpdatedEventHandler };
