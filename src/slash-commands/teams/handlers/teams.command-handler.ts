import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { TeamsCommand } from '../teams.commands.js';

function normalizeTeamId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@CommandHandler(TeamsCommand)
export class TeamsCommandHandler implements ICommandHandler<TeamsCommand> {
  constructor(
    private readonly helperTeamCollection: HelperTeamCollection,
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
    const name = interaction.options.getString('name', true);
    const description = interaction.options.getString('description');
    const memberRole = interaction.options.getRole('member-role', true);
    const leaderUser = interaction.options.getUser('leader', true);

    const now = Timestamp.now();
    await this.helperTeamCollection.upsert({
      guildId: interaction.guildId,
      teamId: normalizeTeamId(name),
      name,
      description: description ?? undefined,
      active: true,
      memberRoleId: memberRole.id,
      leaderUserId: leaderUser.id,
      createdAt: now,
      updatedAt: now,
    });

    await interaction.editReply(`Team **${name}** created successfully!`);
  }

  private async handleEdit(
    interaction: TeamsCommand['interaction'],
  ): Promise<void> {
    const memberRole = interaction.options.getRole('member-role', true);
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
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

    const updatedName = name ?? team.name;

    await this.helperTeamCollection.upsert({
      ...team,
      name: updatedName,
      description: description ?? team.description,
      leaderUserId: leaderUser?.id ?? team.leaderUserId,
      updatedAt: Timestamp.now(),
    });

    await interaction.editReply(`Team **${updatedName}** updated.`);
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
    await interaction.editReply(`Team **${team.name}** archived.`);
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
      .setTitle(`${team.name} — Members`)
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

    const embed = new EmbedBuilder().setTitle('Active Helper Teams').addFields(
      teams.map((t) => ({
        name: t.name,
        value: t.description ?? t.teamId,
        inline: false,
      })),
    );

    await interaction.editReply({ embeds: [embed] });
  }
}
