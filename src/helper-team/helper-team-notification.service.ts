import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { EmbedBuilder } from 'discord.js';
import { DiscordService } from '../discord/discord.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { formatDiscordTimestamp } from './helper-team-time.js';

type NotificationResult = { sent: true } | { sent: false; reason: string };

@Injectable()
export class HelperTeamNotificationService {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly discordService: DiscordService,
  ) {}

  @SentryTraced()
  public async sendSessionAbsenceNotification(input: {
    guildId: string;
    helperUserId: string;
    teamName: string;
    occurrenceUnixSeconds: number;
    reason?: string;
  }): Promise<NotificationResult> {
    const resolved = await this.resolveChannel(input.guildId);
    if (!resolved.ok) return { sent: false, reason: resolved.reason };

    const embed = new EmbedBuilder()
      .setTitle('Helper Absence Reported')
      .setDescription(
        `<@${input.helperUserId}> has reported an absence for the **${input.teamName}** session on ${formatDiscordTimestamp(input.occurrenceUnixSeconds, 'f')} (${formatDiscordTimestamp(input.occurrenceUnixSeconds, 'R')}).`,
      );

    if (input.reason) {
      embed.addFields({ name: 'Reason', value: input.reason });
    }

    await resolved.channel.send({ embeds: [embed] });
    return { sent: true };
  }

  @SentryTraced()
  public async sendRangeAbsenceNotification(input: {
    guildId: string;
    helperUserId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }): Promise<NotificationResult> {
    const resolved = await this.resolveChannel(input.guildId);
    if (!resolved.ok) return { sent: false, reason: resolved.reason };

    const embed = new EmbedBuilder()
      .setTitle('Helper Range Absence Reported')
      .setDescription(
        `<@${input.helperUserId}> has reported an absence from **${input.startDate}** to **${input.endDate}**.`,
      );

    if (input.reason) {
      embed.addFields({ name: 'Reason', value: input.reason });
    }

    await resolved.channel.send({ embeds: [embed] });
    return { sent: true };
  }

  @SentryTraced()
  public async sendAbsenceRemovedNotification(input: {
    guildId: string;
    helperUserId: string;
    description: string;
  }): Promise<NotificationResult> {
    const resolved = await this.resolveChannel(input.guildId);
    if (!resolved.ok) return { sent: false, reason: resolved.reason };

    const embed = new EmbedBuilder()
      .setTitle('Helper Absence Removed')
      .setDescription(
        `<@${input.helperUserId}> has removed their absence: **${input.description}**.`,
      );

    await resolved.channel.send({ embeds: [embed] });
    return { sent: true };
  }

  private async resolveChannel(guildId: string): Promise<
    | {
        ok: true;
        channel: NonNullable<
          Awaited<ReturnType<DiscordService['getTextChannel']>>
        >;
      }
    | { ok: false; reason: string }
  > {
    const settings = await this.settingsCollection.getSettings(guildId);
    if (!settings?.absenceNotificationChannelId) {
      return { ok: false, reason: 'missing-channel-setting' };
    }

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: settings.absenceNotificationChannelId,
    });

    if (!channel) {
      return { ok: false, reason: 'channel-not-found' };
    }

    return { ok: true, channel };
  }
}
