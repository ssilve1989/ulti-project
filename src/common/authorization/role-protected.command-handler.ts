import { Inject } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';
import { RoleManagerService } from '../../role-manager/role-manager.service.js';

type CommandWithInteraction = {
  interaction: ChatInputCommandInteraction<'cached'>;
};

export abstract class RoleProtectedHandler<T extends CommandWithInteraction> {
  @Inject() protected readonly roleManagerService: RoleManagerService;

  abstract execute(command: T): Promise<unknown>;
}
