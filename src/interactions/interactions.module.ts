import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { verifyKeyMiddleware } from 'discord-interactions';
import { Client, Events } from 'discord.js';
import { match } from 'ts-pattern';
import { AppConfig } from '../app.config.js';
import { InjectDiscordClient } from '../discord/discord.decorators.js';
import { DiscordModule } from '../discord/discord.module.js';
import { SignupCommand } from '../signups/signup.commands.js';
import { StatusCommand } from '../status/commands/status.command.js';
import { InteractionsController } from './interactions.controller.js';

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

      // TODO: This could be more generic somehow
      const command = match(interaction.commandName)
        .with(SignupCommand.NAME, () => new SignupCommand(interaction))
        .with(StatusCommand.NAME, () => new StatusCommand(interaction))
        .run();

      this.commandBus.execute(command);
    });
  }
}

export { InteractionsModule };
