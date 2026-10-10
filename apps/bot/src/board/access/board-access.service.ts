import { Injectable } from '@nestjs/common';
import type { BoardAccess, SquadView } from '@ulti-project/shared';
import { boardConfig } from '../../config/board.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { squadsOf, squadView } from '../squads.js';

/** How long a member's resolved access is reused before their roles are read again. */
const ACCESS_TTL_MS = 60_000;

/** Decides what a Discord user may do on the board from their roles in the board guild. */
@Injectable()
export class BoardAccessService {
  private readonly cache = new Map<
    string,
    { readonly access: BoardAccess; readonly expiresAt: number }
  >();

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
  ) {}

  /** The user's access, reused for 60s after it's read so a role change takes up to a minute to apply. */
  async resolve(discordId: string, now = Date.now()): Promise<BoardAccess> {
    const cached = this.cache.get(discordId);
    if (cached !== undefined && now < cached.expiresAt) return cached.access;
    const access = await this.read(discordId);
    this.cache.set(discordId, { access, expiresAt: now + ACCESS_TTL_MS });
    return access;
  }

  private async read(discordId: string): Promise<BoardAccess> {
    const guildId = boardConfig.GUILD_ID;
    const member = await this.discordService.getGuildMember({
      memberId: discordId,
      guildId,
    });
    if (member === undefined) return { kind: 'denied', reason: 'not-in-guild' };
    const roles = member.roles.cache;
    const settings = await this.settingsCollection.getSettings(guildId);
    const squads: SquadView[] = squadsOf(settings)
      .filter((squad) => roles.has(squad.roleId))
      .map(squadView);
    const [squad, ...others] = squads;
    if (squad !== undefined) {
      return others.length === 0
        ? { kind: 'squad', squad }
        : { kind: 'squad-conflict', squads };
    }
    const viewerRoles = settings?.boardViewerRoles ?? [];
    return viewerRoles.some((roleId) => roles.has(roleId))
      ? { kind: 'viewer' }
      : { kind: 'denied', reason: 'no-role' };
  }
}
