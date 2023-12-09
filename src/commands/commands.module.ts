import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientModule } from '../client/client.module.js';
import { CommandsService } from './commands.service.js';

@Module({
  imports: [ClientModule, ConfigModule],
  providers: [CommandsService],
})
export class CommandsModule implements OnApplicationBootstrap {
  constructor(private readonly commandsService: CommandsService) {}

  onApplicationBootstrap() {
    return this.commandsService.registerCommands();
  }
}
