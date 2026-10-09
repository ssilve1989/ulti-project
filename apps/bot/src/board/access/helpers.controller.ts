import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { SquadHelper } from '@ulti-project/shared';
import type { Request } from 'express';
import { boardConfig } from '../../config/board.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { squadsOf } from '../squads.js';
import { boardContextOf } from './board-context.js';
import { BoardSessionGuard } from './board-session.guard.js';
import { CanClaim } from './can-claim.decorator.js';

/** How long a squad's helpers are reused before the guild's members are fetched again. */
const HELPERS_TTL_MS = 60_000;

/** The members of the caller's squad role, whom its leads can place in a team. */
@Controller('squads/mine/helpers')
@UseGuards(BoardSessionGuard)
export class HelpersController {
  private readonly cache = new Map<
    string,
    { readonly helpers: SquadHelper[]; readonly expiresAt: number }
  >();

  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
  ) {}

  @Get()
  @CanClaim()
  async helpers(@Req() request: Request): Promise<SquadHelper[]> {
    const { access } = boardContextOf(request);
    if (access.kind !== 'squad') {
      throw new Error('The helpers route is missing @CanClaim');
    }
    const squadId = access.squad.id;
    const now = Date.now();
    const cached = this.cache.get(squadId);
    if (cached !== undefined && now < cached.expiresAt) return cached.helpers;
    const helpers = await this.read(squadId);
    this.cache.set(squadId, { helpers, expiresAt: now + HELPERS_TTL_MS });
    return helpers;
  }

  private async read(squadId: string): Promise<SquadHelper[]> {
    const guildId = boardConfig.GUILD_ID;
    const settings = await this.settingsCollection.getSettings(guildId);
    const squad = squadsOf(settings).find(({ id }) => id === squadId);
    // a squad removed since the caller's access was resolved has no helpers
    if (squad === undefined) return [];
    const members = await this.discordService.getRoleMembers({
      guildId,
      roleId: squad.roleId,
    });
    return members
      .map(({ id, displayName }) => ({ discordId: id, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
