import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { USTimeZones } from '../../../common/time-zones.js';
import {
  isOrganizer,
  notOrganizerMessage,
} from '../../../events/organizers.js';
import { readScheduleOptions } from '../../../events/schedules/schedule-options.js';
import { savedScheduleSummary } from '../../../events/schedules/schedule-panel.renderer.js';
import { SchedulePanelSession } from '../../../events/schedules/schedule-panel.session.js';
import { EventSchedulesCollection } from '../../../firebase/collections/event-schedules.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'schedule-create' })
class ScheduleCreateCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly schedulesCollection: EventSchedulesCollection,
    private readonly panel: SchedulePanelSession,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    if (!isOrganizer(interaction.member, settings)) {
      await interaction.editReply(notOrganizerMessage(settings));
      return;
    }

    const options = readScheduleOptions(interaction);
    if (!options.ok) {
      await interaction.editReply(options.message);
      return;
    }

    const draft = await this.panel.open(
      interaction,
      { ...options.values, weekdays: [], timeZone: USTimeZones.EASTERN },
      'create',
    );
    if (!draft) return;

    const schedule = await this.schedulesCollection.create(
      interaction.guildId,
      draft,
      interaction.user.id,
      new Date(),
    );
    await interaction.editReply({
      content: savedScheduleSummary(schedule),
      embeds: [],
      components: [],
    });
  }
}

export { ScheduleCreateCommandHandler };
