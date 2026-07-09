import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type {
  APIEmbedField,
  ChatInputCommandInteraction,
  Guild,
} from 'discord.js';
import {
  EmbedBuilder,
  MessageFlags,
  roleMention,
  userMention,
} from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import {
  type ProgPointRoleChanges,
  ProgPointRolesService,
} from '../../../role-manager/prog-point-roles.service.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { SyncProgRolesSlashCommand } from '../sync-prog-roles.slash-command.js';

const ACTIVE_PARTY_STATUSES: ReadonlySet<PartyStatus> = new Set([
  PartyStatus.EarlyProgParty,
  PartyStatus.ProgParty,
  PartyStatus.ClearParty,
]);

const MAX_FIELD_LENGTH = 1024;
const MAX_DETAIL_FIELDS = 5;
// room for "\n… and 99999 more"
const MORE_MARKER_RESERVE = 24;

interface SyncResult {
  examined: number;
  changed: number;
  rolesAdded: number;
  rolesRemoved: number;
  skippedNoMapping: number;
  skippedNoMember: number;
  skippedNoChanges: number;
  errors: number;
  details: string[];
}

function formatDetail(
  signup: SignupDocument,
  changes: ProgPointRoleChanges,
): string {
  const parts = [
    changes.roleToAdd ? `+${roleMention(changes.roleToAdd)}` : undefined,
    ...changes.rolesToRemove.map((roleId) => `−${roleMention(roleId)}`),
  ].filter((part): part is string => Boolean(part));

  return `${userMention(signup.discordId)} ${signup.encounter}: ${parts.join(' ')}`;
}

function packLines(
  details: string[],
  startIndex: number,
  budget: number,
): { lines: string[]; nextIndex: number } {
  const lines: string[] = [];
  let length = 0;
  let index = startIndex;

  while (index < details.length) {
    const line = details[index];
    const lineLength = line.length + (lines.length > 0 ? 1 : 0);
    if (length + lineLength > budget) {
      break;
    }
    lines.push(line);
    length += lineLength;
    index++;
  }

  return { lines, nextIndex: index };
}

function buildDetailFields(details: string[]): APIEmbedField[] {
  const fields: APIEmbedField[] = [];
  let index = 0;

  while (index < details.length && fields.length < MAX_DETAIL_FIELDS) {
    const isLastField = fields.length === MAX_DETAIL_FIELDS - 1;
    const budget = isLastField
      ? MAX_FIELD_LENGTH - MORE_MARKER_RESERVE
      : MAX_FIELD_LENGTH;

    const { lines, nextIndex } = packLines(details, index, budget);
    index = nextIndex;

    if (lines.length === 0) {
      break;
    }

    const remaining = details.length - index;
    const value =
      isLastField && remaining > 0
        ? `${lines.join('\n')}\n… and ${remaining} more`
        : lines.join('\n');

    fields.push({
      name: fields.length === 0 ? 'Changes' : 'Changes (cont.)',
      value,
      inline: false,
    });
  }

  return fields;
}

@Injectable()
@SlashCommand({ builder: SyncProgRolesSlashCommand })
class SyncProgRolesCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(SyncProgRolesCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
    private readonly progPointRolesService: ProgPointRolesService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const dryRun = interaction.options.getBoolean('dry-run') ?? false;

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );
      const progPointRoles = settings?.progPointRoles;

      const hasMappings = Object.values(progPointRoles ?? {}).some(
        (mapping) => Object.keys(mapping ?? {}).length > 0,
      );

      if (!hasMappings) {
        await interaction.editReply(
          'No prog point role mappings configured. Use `/settings prog-point-roles` first.',
        );
        return;
      }

      const signups = await this.signupCollection.findByStatusIn([
        SignupStatus.APPROVED,
        SignupStatus.UPDATE_PENDING,
      ]);

      const guild = await this.discordService.client.guilds.fetch(
        interaction.guildId,
      );
      await guild.members.fetch();

      const result = await this.sweep({
        signups,
        guild,
        progPointRoles,
        dryRun,
      });

      this.logger.log(
        `sync-prog-roles${dryRun ? ' (dry-run)' : ''}: ${result.changed}/${result.examined} signups changed, ${result.errors} errors`,
      );

      await interaction.editReply({
        embeds: [this.createSummaryEmbed(result, dryRun)],
      });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async sweep({
    signups,
    guild,
    progPointRoles,
    dryRun,
  }: {
    signups: SignupDocument[];
    guild: Guild;
    progPointRoles: SettingsDocument['progPointRoles'];
    dryRun: boolean;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      examined: 0,
      changed: 0,
      rolesAdded: 0,
      rolesRemoved: 0,
      skippedNoMapping: 0,
      skippedNoMember: 0,
      skippedNoChanges: 0,
      errors: 0,
      details: [],
    };

    for (const signup of signups) {
      result.examined++;

      const mapping = progPointRoles?.[signup.encounter];

      if (
        !mapping ||
        !signup.progPoint ||
        !mapping[signup.progPoint] ||
        !signup.partyStatus ||
        !ACTIVE_PARTY_STATUSES.has(signup.partyStatus)
      ) {
        result.skippedNoMapping++;
        continue;
      }

      const member = guild.members.cache.get(signup.discordId);

      if (!member) {
        result.skippedNoMember++;
        continue;
      }

      const changes = this.progPointRolesService.computeChanges(
        member,
        mapping,
        signup.progPoint,
      );

      if (!changes.roleToAdd && changes.rolesToRemove.length === 0) {
        result.skippedNoChanges++;
        continue;
      }

      try {
        if (!dryRun) {
          await this.progPointRolesService.applyChanges(member, changes);
        }

        result.changed++;
        if (changes.roleToAdd) {
          result.rolesAdded++;
        }
        result.rolesRemoved += changes.rolesToRemove.length;
        result.details.push(formatDetail(signup, changes));
      } catch (error) {
        result.errors++;
        this.errorService.captureError(error, {
          message: `sync-prog-roles failed for ${signup.discordId} / ${signup.encounter}`,
        });
      }
    }

    return result;
  }

  private createSummaryEmbed(
    result: SyncResult,
    dryRun: boolean,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(dryRun ? '🔍 Sync Prog Roles — Dry Run' : '✅ Sync Prog Roles')
      .setColor(dryRun ? 0x3498db : 0x2ecc71)
      .addFields({
        name: 'Summary',
        value: [
          `**Signups Examined:** ${result.examined}`,
          `**Members ${dryRun ? 'To Change' : 'Changed'}:** ${result.changed}`,
          `**Roles Added:** ${result.rolesAdded}`,
          `**Roles Removed:** ${result.rolesRemoved}`,
          `**Skipped (no mapping/prog point):** ${result.skippedNoMapping}`,
          `**Skipped (member left):** ${result.skippedNoMember}`,
          `**Skipped (already correct):** ${result.skippedNoChanges}`,
          `**Errors:** ${result.errors}`,
        ].join('\n'),
        inline: false,
      });

    embed.addFields(buildDetailFields(result.details));

    if (dryRun) {
      embed.setFooter({
        text: '💡 Run without dry-run to apply these changes',
      });
    }

    return embed;
  }
}

export { SyncProgRolesCommandHandler };
