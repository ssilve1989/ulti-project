import { randomUUID } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ComponentType,
  DiscordjsErrorCodes,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { ErrorService } from '../../../error/error.service.js';
import {
  calculateAbsenceExpiresAt,
  HelperAbsenceCollection,
} from '../../../firebase/collections/helper-absence.collection.js';
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { HelperTeamMembershipService } from '../../../helper-team/helper-team-membership.service.js';
import { HelperTeamNotificationService } from '../../../helper-team/helper-team-notification.service.js';
import { getNextOccurrence } from '../../../helper-team/helper-team-time.js';
import { HelpersCommand } from '../helpers.commands.js';

const DAYS_AHEAD = 14;

@CommandHandler(HelpersCommand)
export class HelpersCommandHandler implements ICommandHandler<HelpersCommand> {
  constructor(
    private readonly membershipService: HelperTeamMembershipService,
    private readonly authorizationService: HelperTeamAuthorizationService,
    private readonly sessionCollection: HelperTeamSessionCollection,
    private readonly absenceCollection: HelperAbsenceCollection,
    private readonly notificationService: HelperTeamNotificationService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: HelpersCommand) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'absent-session':
          await this.handleAbsentSession(interaction);
          break;
        case 'absent-range':
          await this.handleAbsentRange(interaction);
          break;
        case 'absent-remove':
          await this.handleAbsentRemove(interaction);
          break;
        case 'status':
          await this.handleStatus(interaction);
          break;
        default:
          await interaction.editReply(`Unknown subcommand: ${subcommand}`);
      }
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async handleAbsentSession(
    interaction: HelpersCommand['interaction'],
  ): Promise<void> {
    const canUse = await this.authorizationService.canUseHelperSelfService(
      interaction.guildId,
      interaction.user.id,
    );
    if (!canUse) {
      await interaction.editReply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    const memberships = await this.membershipService.getMembershipsForUser(
      interaction.guildId,
      interaction.user.id,
    );

    if (memberships.length === 0) {
      await interaction.editReply('No upcoming team sessions found.');
      return;
    }

    const teamIds = memberships.map((m) => m.teamId);
    const sessions = await this.sessionCollection.getActiveForTeams(
      interaction.guildId,
      teamIds,
    );

    const options = this.buildSessionSelectOptions(sessions, memberships);

    if (options.length === 0) {
      await interaction.editReply('No upcoming team sessions found.');
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('absence-session-select')
      .setPlaceholder('Select a session to mark absent')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select,
    );

    const replyMessage = await interaction.editReply({ components: [row] });
    await this.collectAndRecordSessionAbsence(
      interaction,
      replyMessage,
      memberships,
    );
  }

  private buildSessionSelectOptions(
    sessions: Awaited<
      ReturnType<HelperTeamSessionCollection['getActiveForTeams']>
    >,
    memberships: Awaited<
      ReturnType<HelperTeamMembershipService['getMembershipsForUser']>
    >,
  ): StringSelectMenuOptionBuilder[] {
    const now = Temporal.Now.instant();
    const cutoff = now.add({ hours: DAYS_AHEAD * 24 });
    const options: StringSelectMenuOptionBuilder[] = [];

    for (const session of sessions) {
      try {
        const occurrence = getNextOccurrence({ ...session, now });
        if (Temporal.Instant.compare(occurrence.start, cutoff) <= 0) {
          const membership = memberships.find(
            (m) => m.teamId === session.teamId,
          );
          const teamName = membership?.roleName ?? session.teamId;
          options.push(
            new StringSelectMenuOptionBuilder()
              .setLabel(`${teamName} — ${session.startTime}`)
              .setValue(
                `${session.teamId}|${session.sessionId}|${occurrence.unixSeconds}`,
              ),
          );
        }
      } catch {
        // Skip sessions with no occurrence in range
      }
    }

    return options;
  }

  private async collectAndRecordSessionAbsence(
    interaction: HelpersCommand['interaction'],
    replyMessage: Awaited<
      ReturnType<HelpersCommand['interaction']['editReply']>
    >,
    memberships: Awaited<
      ReturnType<HelperTeamMembershipService['getMembershipsForUser']>
    >,
  ): Promise<void> {
    let componentInteraction: Awaited<
      ReturnType<
        typeof replyMessage.awaitMessageComponent<ComponentType.StringSelect>
      >
    >;
    try {
      componentInteraction =
        await replyMessage.awaitMessageComponent<ComponentType.StringSelect>({
          filter: isSameUserFilter(interaction.user),
          time: 60_000,
        });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === DiscordjsErrorCodes.InteractionCollectorError
      ) {
        await interaction.editReply({
          content: 'Selection timed out.',
          components: [],
        });
        return;
      }
      throw error;
    }

    await componentInteraction.deferUpdate();

    const [teamId, sessionId, unixSecondsStr] =
      componentInteraction.values[0].split('|');
    const occurrenceUnixSeconds = Number(unixSecondsStr);
    const occurrenceStart = Timestamp.fromDate(
      new Date(occurrenceUnixSeconds * 1000),
    );

    const session = await this.sessionCollection.get(
      interaction.guildId,
      sessionId,
    );
    if (!session?.active) {
      await interaction.editReply({
        content: 'That session is no longer active.',
        components: [],
      });
      return;
    }

    const occurrenceEnd = Timestamp.fromDate(
      new Date(
        occurrenceUnixSeconds * 1000 + session.durationMinutes * 60 * 1000,
      ),
    );
    const reason = interaction.options.getString('reason');
    const absenceNow = Timestamp.now();

    await this.absenceCollection.create({
      type: 'session',
      guildId: interaction.guildId,
      absenceId: randomUUID(),
      discordId: interaction.user.id,
      teamId,
      sessionId,
      occurrenceStart,
      occurrenceEnd,
      reason: reason ?? undefined,
      createdAt: absenceNow,
      updatedAt: absenceNow,
      expiresAt: calculateAbsenceExpiresAt(occurrenceEnd.toDate()),
    });

    const membership = memberships.find((m) => m.teamId === teamId);
    const teamName = membership?.roleName ?? teamId;

    const notification =
      await this.notificationService.sendSessionAbsenceNotification({
        guildId: interaction.guildId,
        helperUserId: interaction.user.id,
        teamName,
        occurrenceUnixSeconds,
        reason: reason ?? undefined,
      });

    const notificationNote = notification.sent
      ? 'Coordinators have been notified.'
      : 'Note: coordinator notification channel not configured.';

    await interaction.editReply({
      content: `Your absence has been recorded. ${notificationNote}`,
      components: [],
    });
  }

  private async handleAbsentRange(
    interaction: HelpersCommand['interaction'],
  ): Promise<void> {
    const canUse = await this.authorizationService.canUseHelperSelfService(
      interaction.guildId,
      interaction.user.id,
    );
    if (!canUse) {
      await interaction.editReply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    const startDate = interaction.options.getString('start-date', true);
    const endDate = interaction.options.getString('end-date', true);
    const timezone = interaction.options.getString('timezone', true);
    const reason = interaction.options.getString('reason');

    // Use start of the next UTC day — past end-of-day in any timezone, avoiding server local time.
    const absenceEnd = new Date(`${endDate}T00:00:00.000Z`);
    absenceEnd.setUTCDate(absenceEnd.getUTCDate() + 1);
    const expiresAt = calculateAbsenceExpiresAt(absenceEnd);
    const now = Timestamp.now();

    await this.absenceCollection.create({
      type: 'range',
      guildId: interaction.guildId,
      absenceId: randomUUID(),
      discordId: interaction.user.id,
      startDate,
      endDate,
      timezone,
      reason: reason ?? undefined,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    await this.notificationService.sendRangeAbsenceNotification({
      guildId: interaction.guildId,
      helperUserId: interaction.user.id,
      startDate,
      endDate,
      reason: reason ?? undefined,
    });

    await interaction.editReply(
      `Your absence from **${startDate}** to **${endDate}** has been recorded.`,
    );
  }

  private async handleAbsentRemove(
    interaction: HelpersCommand['interaction'],
  ): Promise<void> {
    const canUse = await this.authorizationService.canUseHelperSelfService(
      interaction.guildId,
      interaction.user.id,
    );
    if (!canUse) {
      await interaction.editReply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    const absences = await this.absenceCollection.getFutureForUser(
      interaction.guildId,
      interaction.user.id,
      new Date(),
    );

    if (absences.length === 0) {
      await interaction.editReply('You have no upcoming absences to remove.');
      return;
    }

    const options = absences.map((a) => {
      const label =
        a.type === 'session'
          ? `Session absence: ${a.teamId}`
          : `Range: ${a.startDate} to ${a.endDate}`;
      return new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(a.absenceId);
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId('absence-remove-select')
      .setPlaceholder('Select an absence to remove')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select,
    );

    const replyMessage = await interaction.editReply({ components: [row] });

    let componentInteraction: Awaited<
      ReturnType<
        typeof replyMessage.awaitMessageComponent<ComponentType.StringSelect>
      >
    >;
    try {
      componentInteraction =
        await replyMessage.awaitMessageComponent<ComponentType.StringSelect>({
          filter: isSameUserFilter(interaction.user),
          time: 60_000,
        });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === DiscordjsErrorCodes.InteractionCollectorError
      ) {
        await interaction.editReply({
          content: 'Selection timed out.',
          components: [],
        });
        return;
      }
      throw error;
    }

    await componentInteraction.deferUpdate();

    const absenceId = componentInteraction.values[0];
    const absence = absences.find((a) => a.absenceId === absenceId);
    const description =
      absence?.type === 'session'
        ? `Session absence: ${absence.teamId}`
        : absence
          ? `Range: ${absence.startDate} to ${absence.endDate}`
          : absenceId;

    await this.absenceCollection.remove(interaction.guildId, absenceId);

    await this.notificationService.sendAbsenceRemovedNotification({
      guildId: interaction.guildId,
      helperUserId: interaction.user.id,
      description,
    });

    await interaction.editReply({
      content: `Absence **${description}** has been removed.`,
      components: [],
    });
  }

  private async handleStatus(
    interaction: HelpersCommand['interaction'],
  ): Promise<void> {
    const isCoordinator = await this.authorizationService.isCoordinator(
      interaction.guildId,
      interaction.user.id,
    );
    if (!isCoordinator) {
      await interaction.editReply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    const absences = await this.absenceCollection.getActiveForGuild(
      interaction.guildId,
      new Date(),
    );

    const embed = new EmbedBuilder().setTitle('Helper Absence Status');

    if (absences.length === 0) {
      embed.setDescription('No upcoming absences.');
    } else {
      const byUser = new Map<string, typeof absences>();
      for (const absence of absences) {
        const existing = byUser.get(absence.discordId) ?? [];
        existing.push(absence);
        byUser.set(absence.discordId, existing);
      }

      for (const [discordId, userAbsences] of byUser) {
        const summary = userAbsences
          .map((a) =>
            a.type === 'session'
              ? `Session (${a.teamId})`
              : `Range: ${a.startDate} → ${a.endDate}`,
          )
          .join('\n');
        embed.addFields({
          name: `<@${discordId}>`,
          value: summary,
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
