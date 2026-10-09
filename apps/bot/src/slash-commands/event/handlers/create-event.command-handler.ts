import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { Encounter } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  channelMention,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  TimestampStyles,
  time,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { parseDiscordTime } from '../../../common/discord-time.js';
import { ComponentSessionService } from '../../../discord/component-session.service.js';
import { recordExpiredPrompt } from '../../../discord/discord.helpers.js';
import {
  EVENT_ENCOUNTERS_SELECT_ID,
  encounterSelect,
  readEncounterSelection,
} from '../../../events/components/encounter-select.js';
import { EventMessageService } from '../../../events/event-message.service.js';
import {
  isOrganizer,
  notOrganizerMessage,
} from '../../../events/organizers.js';
import { EventsCollection } from '../../../firebase/collections/events.collection.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { EventSlashCommand } from '../event.slash-command.js';

const POST_ID = 'eventPost';
const CANCEL_ID = 'eventCancel';

const BAD_START =
  "I couldn't read that start time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.";
const BAD_SIGNUPS_CLOSE =
  "I couldn't read that sign-up close time. Use a Discord timestamp like <t:1760000000:F> or unix seconds, in the future.";
const CLOSE_AFTER_START = 'Sign-ups must close at or before the start time.';

type EventTimes =
  | { valid: true; startsAt: Date; signupsCloseAt: Date }
  | { valid: false; problem: string };

/** The start and sign-up close times, both in the future and closing no later than the start. */
function readTimes(
  start: string,
  signupsClose: string | null,
  now: number,
): EventTimes {
  const startsAt = parseDiscordTime(start);
  if (!startsAt || startsAt.getTime() <= now) {
    return { valid: false, problem: BAD_START };
  }
  const signupsCloseAt =
    signupsClose === null ? startsAt : parseDiscordTime(signupsClose);
  if (!signupsCloseAt || signupsCloseAt.getTime() <= now) {
    return { valid: false, problem: BAD_SIGNUPS_CLOSE };
  }
  if (signupsCloseAt > startsAt) {
    return { valid: false, problem: CLOSE_AFTER_START };
  }
  return { valid: true, startsAt, signupsCloseAt };
}

/** The panel's components with `encounters` picked; Post needs at least one. */
function panelComponents(
  encounters: readonly Encounter[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    encounterSelect(EVENT_ENCOUNTERS_SELECT_ID, encounters),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(POST_ID)
        .setLabel('Post')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(encounters.length === 0),
      new ButtonBuilder()
        .setCustomId(CANCEL_ID)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

@Injectable()
@SlashCommand({ builder: EventSlashCommand, subcommand: 'create' })
class CreateEventCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly eventsCollection: EventsCollection,
    private readonly eventMessages: EventMessageService,
    private readonly sessions: ComponentSessionService,
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

    const { options } = interaction;
    const times = readTimes(
      options.getString('start', true),
      options.getString('signups-close'),
      Date.now(),
    );
    if (!times.valid) {
      await interaction.editReply(times.problem);
      return;
    }

    const title = options.getString('title', true);
    const encounters = await this.pickEncounters(
      interaction,
      `**${title}** · starts ${time(times.startsAt, TimestampStyles.FullDateShortTime)} · sign-ups close ${time(times.signupsCloseAt, TimestampStyles.RelativeTime)}`,
    );
    if (!encounters) return;

    const event = await this.eventsCollection.create({
      guildId: interaction.guildId,
      title,
      startsAt: Timestamp.fromDate(times.startsAt),
      signupsCloseAt: Timestamp.fromDate(times.signupsCloseAt),
      encounters,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
    });
    // an event nobody can see would linger as active, so remove it and let the error report
    const message = await this.eventMessages
      .post(event)
      .catch(async (error: unknown) => {
        await this.eventsCollection.delete(event.id);
        throw error;
      });

    await interaction.editReply(
      `Posted **${title}** in ${channelMention(interaction.channelId)}: ${message.url}`,
    );
  }

  /**
   * Shows the panel under `summary` in `interaction`'s deferred reply. Resolves
   * with the picked encounters on Post, leaving the caller to replace the
   * panel, or with undefined once the organizer cancels or lets it expire, or
   * the panel is deleted.
   */
  private async pickEncounters(
    interaction: ChatInputCommandInteraction<'cached'>,
    summary: string,
  ): Promise<Encounter[] | undefined> {
    const reply = await interaction.editReply({
      content: summary,
      components: panelComponents([]),
    });
    const { promise, resolve } = Promise.withResolvers<
      Encounter[] | undefined
    >();
    let encounters: Encounter[] = [];

    const end = this.sessions.run(interaction, reply, {
      name: 'event create',
      expiredContent: 'This prompt expired.',
      onExpired: () => recordExpiredPrompt(interaction),
      onAbandoned: () => resolve(undefined),
      onCollect: async (i) => {
        if (i.isStringSelectMenu()) {
          encounters = readEncounterSelection(i.values);
          await i.update({ components: panelComponents(encounters) });
        } else if (i.customId === POST_ID) {
          // stopping first ignores a second click while this one posts
          end();
          try {
            await i.update({ components: [] });
          } finally {
            resolve(encounters);
          }
        } else if (i.customId === CANCEL_ID) {
          end();
          resolve(undefined);
          await i.update({ content: 'Cancelled.', components: [] });
        }
      },
    });
    return promise;
  }
}

export { CreateEventCommandHandler };
