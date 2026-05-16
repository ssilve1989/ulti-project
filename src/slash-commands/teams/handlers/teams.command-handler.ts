import { randomUUID } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import {
  formatDiscordTimestamp,
  getNextOccurrence,
  isValidTime,
} from '../../../helper-team/helper-team-time.js';
import { TeamsCommand } from '../teams.commands.js';

const DAY_NAMES = [
  '',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

@CommandHandler(TeamsCommand)
export class TeamsCommandHandler implements ICommandHandler<TeamsCommand> {
  constructor(
    private readonly helperTeamCollection: HelperTeamCollection,
    private readonly sessionCollection: HelperTeamSessionCollection,
    private readonly discordService: DiscordService,
    private readonly authorizationService: HelperTeamAuthorizationService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: TeamsCommand) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const isAuthorized = await this.authorizationService.isCoordinator(
        interaction.guildId,
        interaction.user.id,
      );
      if (!isAuthorized) {
        await interaction.editReply({
          content: 'You do not have permission to use this command.',
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'create':
          await this.handleCreate(interaction);
          break;
        case 'edit':
          await this.handleEdit(interaction);
          break;
        case 'archive':
          await this.handleArchive(interaction);
          break;
        case 'members':
          await this.handleMembers(interaction);
          break;
        case 'view':
          await this.handleView(interaction);
          break;
        case 'schedule-add':
          await this.handleScheduleAdd(interaction);
          break;
        case 'schedule-list':
          await this.handleScheduleList(interaction);
          break;
        case 'schedule-edit':
          await this.handleScheduleEdit(interaction);
          break;
        case 'schedule-remove':
          await this.handleScheduleRemove(interaction);
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

  private async handleCreate(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);
    const leaderUser = interaction.options.getUser('leader', true);

    const now = Timestamp.now();
    await this.helperTeamCollection.upsert({
      guildId: interaction.guildId,
      teamId: memberRole.id,
      active: true,
      memberRoleId: memberRole.id,
      leaderUserId: leaderUser.id,
      createdAt: now,
      updatedAt: now,
    });

    await interaction.editReply(
      `Team for <@&${memberRole.id}> created successfully!`,
    );
  }

  private async handleEdit(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);
    const leaderUser = interaction.options.getUser('leader');

    const team = await this.helperTeamCollection.getByMemberRole(
      interaction.guildId,
      memberRole.id,
    );
    if (!team) {
      await interaction.editReply(
        `No team is configured for the role <@&${memberRole.id}>.`,
      );
      return;
    }

    await this.helperTeamCollection.upsert({
      ...team,
      leaderUserId: leaderUser?.id ?? team.leaderUserId,
      updatedAt: Timestamp.now(),
    });

    await interaction.editReply(`Team for <@&${team.memberRoleId}> updated.`);
  }

  private async handleArchive(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);

    const team = await this.helperTeamCollection.getByMemberRole(
      interaction.guildId,
      memberRole.id,
    );
    if (!team) {
      await interaction.editReply(
        `No team is configured for the role <@&${memberRole.id}>.`,
      );
      return;
    }

    await this.helperTeamCollection.archive(interaction.guildId, team.teamId);
    await interaction.editReply(`Team for <@&${team.memberRoleId}> archived.`);
  }

  private async handleMembers(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);

    const team = await this.helperTeamCollection.getByMemberRole(
      interaction.guildId,
      memberRole.id,
    );
    if (!team) {
      await interaction.editReply(
        `No team is configured for the role <@&${memberRole.id}>.`,
      );
      return;
    }

    const members = await this.discordService.getMembersWithRole({
      guildId: interaction.guildId,
      roleId: team.memberRoleId,
    });

    const memberList =
      members.length > 0
        ? members.map((m) => m.displayName).join('\n')
        : 'None';

    const embed = new EmbedBuilder()
      .setTitle(`<@&${team.memberRoleId}> — Members`)
      .addFields(
        { name: 'Leader', value: `<@${team.leaderUserId}>`, inline: true },
        { name: 'Members', value: memberList, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleView(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const teams = await this.helperTeamCollection.getActiveForGuild(
      interaction.guildId,
    );

    if (teams.length === 0) {
      await interaction.editReply('No active teams found.');
      return;
    }

    const [memberLists, roleNames] = await Promise.all([
      Promise.all(
        teams.map((t) =>
          this.discordService.getMembersWithRole({
            guildId: interaction.guildId,
            roleId: t.memberRoleId,
          }),
        ),
      ),
      Promise.all(
        teams.map((t) =>
          this.discordService.getRoleName({
            guildId: interaction.guildId,
            roleId: t.memberRoleId,
          }),
        ),
      ),
    ]);

    const embed = new EmbedBuilder().setTitle('Active Helper Teams').addFields(
      teams.map((t, i) => {
        const nonLeaders = memberLists[i].filter(
          (m) => m.user.id !== t.leaderUserId,
        );
        const lines = [
          `<@${t.leaderUserId}> (Leader)`,
          ...nonLeaders.map((m) => `<@${m.user.id}>`),
        ];
        return {
          name: roleNames[i],
          value: lines.join('\n'),
          inline: false,
        };
      }),
    );

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleScheduleAdd(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);
    const dayOfWeek = interaction.options.getInteger('day-of-week', true) as
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7;
    const startTime = interaction.options.getString('start-time', true);
    const durationMinutes = interaction.options.getInteger(
      'duration-minutes',
      true,
    );
    const timezone = interaction.options.getString('timezone', true);

    if (!isValidTime(startTime)) {
      await interaction.editReply(
        'Invalid start time. Use HH:mm format (e.g. 20:00).',
      );
      return;
    }

    const team = await this.helperTeamCollection.getByMemberRole(
      interaction.guildId,
      memberRole.id,
    );
    if (!team) {
      await interaction.editReply(
        `No team is configured for the role <@&${memberRole.id}>.`,
      );
      return;
    }

    if (team.leaderUserId !== interaction.user.id) {
      await interaction.editReply(
        `You are not the leader of the <@&${team.memberRoleId}> team.`,
      );
      return;
    }

    const now = Timestamp.now();
    await this.sessionCollection.upsert({
      guildId: interaction.guildId,
      sessionId: randomUUID(),
      teamId: team.teamId,
      active: true,
      dayOfWeek,
      startTime,
      durationMinutes,
      timezone,
      createdAt: now,
      updatedAt: now,
    });

    await interaction.editReply(
      `Schedule added: ${DAY_NAMES[dayOfWeek]} at ${startTime} (${durationMinutes}min, ${timezone}).`,
    );
  }

  private async handleScheduleList(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);

    const team = await this.helperTeamCollection.getByMemberRole(
      interaction.guildId,
      memberRole.id,
    );
    if (!team) {
      await interaction.editReply(
        `No team is configured for the role <@&${memberRole.id}>.`,
      );
      return;
    }

    if (team.leaderUserId !== interaction.user.id) {
      await interaction.editReply(
        `You are not the leader of the <@&${team.memberRoleId}> team.`,
      );
      return;
    }

    const sessions = await this.sessionCollection.getActiveForTeams(
      interaction.guildId,
      [team.teamId],
    );
    if (sessions.length === 0) {
      await interaction.editReply('No active sessions for this team.');
      return;
    }

    const embed = new EmbedBuilder().setTitle(
      `<@&${team.memberRoleId}> — Schedule`,
    );

    for (const session of sessions) {
      let nextLine: string;
      try {
        const occurrence = getNextOccurrence({
          ...session,
          now: Temporal.Now.instant(),
        });
        nextLine = `Next: ${formatDiscordTimestamp(occurrence.unixSeconds, 'f')} (${formatDiscordTimestamp(occurrence.unixSeconds, 'R')})`;
      } catch {
        nextLine = 'Next: unavailable';
      }
      embed.addFields({
        name: `${DAY_NAMES[session.dayOfWeek]} at ${session.startTime} (${session.durationMinutes}min)`,
        value: `Timezone: ${session.timezone}\n${nextLine}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleScheduleEdit(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    await interaction.editReply('Not yet implemented.');
  }

  private async handleScheduleRemove(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    await interaction.editReply('Not yet implemented.');
  }
}
