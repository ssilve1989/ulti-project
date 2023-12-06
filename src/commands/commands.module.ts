import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ClientModule } from '../client/client.module.js';
import { CommandsService } from './commands.service.js';
import { ConfigModule } from '@nestjs/config';
import { SignupCommandHandler } from './signups/signups-command.handler.js';

@Module({
  imports: [ClientModule, ConfigModule],
  providers: [CommandsService, SignupCommandHandler],
})
export class CommandsModule implements OnApplicationBootstrap {
  constructor(private readonly commandsService: CommandsService) {}

  onApplicationBootstrap() {
    return this.commandsService.registerCommands();
  }
}
