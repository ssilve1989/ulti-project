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
import { DiscordModule } from '../discord/discord.module.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { Client, Events } from 'discord.js';
import { match } from 'ts-pattern';
import { SignupCommand } from '../signups/signup.commands.js';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [ConfigModule, DiscordModule, CqrsModule],
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
