import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { MeResponse } from '@ulti-project/shared';
import type { Request } from 'express';
import { boardConfig } from '../../config/board.js';
import { DiscordService } from '../../discord/discord.service.js';
import { boardContextOf } from './board-context.js';
import { BoardSessionGuard } from './board-session.guard.js';

@Controller('me')
@UseGuards(BoardSessionGuard)
export class MeController {
  constructor(private readonly discordService: DiscordService) {}

  @Get()
  async me(@Req() request: Request): Promise<MeResponse> {
    const { discordId, name, image, access } = boardContextOf(request);
    // a member who left since their access was resolved has no guild name
    const member = await this.discordService.getGuildMember({
      memberId: discordId,
      guildId: boardConfig.BOARD_GUILD_ID,
    });
    return {
      discordId,
      displayName: member?.displayName ?? name,
      avatarUrl: image,
      access,
    };
  }
}
