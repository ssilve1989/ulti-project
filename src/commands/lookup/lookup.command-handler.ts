import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { capitalCase } from 'change-case';
import { plainToInstance } from 'class-transformer';
import { CommandInteractionOptionResolver, EmbedBuilder } from 'discord.js';
import { EncounterFriendlyDescription } from '../../encounters/encounters.consts.js';
import { SignupRepository } from '../../firebase/collections/signup.repository.js';
import { SignupDocument } from '../../firebase/models/signup.model.js';
import { LookupCommand } from './lookup.command.js';
import { LookupInteractionDto } from './lookup.dto.js';

@CommandHandler(LookupCommand)
class LookupCommandHandler implements ICommandHandler<LookupCommand> {
  private readonly logger = new Logger(LookupCommandHandler.name);

  constructor(private readonly signupsCollection: SignupRepository) {}

  async execute({ interaction }: LookupCommand): Promise<any> {
    const { options } = interaction;

    const request = this.getLookupRequest(options);
    const results = await this.signupsCollection.findAll(request);

    this.logger.debug(results);

    const embed = this.createLookupEmbed(results);
    await interaction.reply({ embeds: [embed] });
  }

  private createLookupEmbed(signups: SignupDocument[]) {
    const fields = signups.flatMap(
      ({ world, character, encounter, availability }) => [
        {
          name: 'Character',
          value: `${capitalCase(character)} @ ${capitalCase(world)}`,
          inline: true,
        },
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
          inline: true,
        },
        {
          name: 'Availability',
          value: availability,
          inline: true,
        },
      ],
    );

    return new EmbedBuilder().setTitle(`Lookup Results`).addFields(fields);
  }

  private getLookupRequest(
    options: Omit<
      CommandInteractionOptionResolver<'cached' | 'raw'>,
      'getMessage' | 'getFocused'
    >,
  ) {
    const character = options.getString('character')!;
    const world = options.getString('world') ?? undefined;

    return plainToInstance(LookupInteractionDto, { character, world });
  }
}

export { LookupCommandHandler };
