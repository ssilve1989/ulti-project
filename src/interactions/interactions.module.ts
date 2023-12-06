import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { verifyKeyMiddleware } from 'discord-interactions';
import { InteractionsController } from './interactions.controller.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../app.config.js';
import { ClientModule } from '../client/client.module.js';
import { InjectDiscordClient } from '../client/client.decorators.js';
import { Client, Events } from 'discord.js';
import { match } from 'ts-pattern';
import { SignupCommand } from '../commands/signups/signups.command.js';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [ConfigModule, ClientModule, CqrsModule],
  controllers: [InteractionsController],
})
class InteractionsModule implements NestModule, OnApplicationBootstrap {
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly commandBus: CommandBus,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    const PUBLIC_KEY = this.configService.get('PUBLIC_KEY');
    consumer
      .apply(verifyKeyMiddleware(PUBLIC_KEY))
      .forRoutes(InteractionsController);
  }

  onApplicationBootstrap() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = match(interaction.commandName)
        .with(SignupCommand.NAME, () => new SignupCommand(interaction))
        .run();

      this.commandBus.execute(command);
    });
  }
}

export { InteractionsModule };
