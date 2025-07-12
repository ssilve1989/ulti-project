import { Inject } from '@nestjs/common';
import { RoleManagerService } from '../../role-manager/role-manager.service.js';
import type { DiscordCommand } from '../../slash-commands/slash-commands.interfaces.js';

export abstract class RoleProtectedHandler<T extends DiscordCommand> {
  @Inject() protected readonly roleManagerService: RoleManagerService;

  abstract execute(command: T): Promise<unknown>;
}
