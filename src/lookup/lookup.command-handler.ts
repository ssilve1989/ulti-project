import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { plainToInstance } from 'class-transformer';
import {
  Colors,
  CommandInteractionOptionResolver,
  EmbedBuilder,
} from 'discord.js';
import { characterField, encounterField } from '../common/components/fields.js';
import { createFields } from '../common/embed-helpers.js';
import { SignupCollection } from '../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../firebase/models/signup.model.js';
import { SentryTraced } from '../observability/span.decorator.js';
import { LookupCommand } from './lookup.command.js';
import { LookupInteractionDto } from './lookup.dto.js';

@CommandHandler(LookupCommand)
class LookupCommandHandler implements ICommandHandler<LookupCommand> {
  private readonly logger = new Logger(LookupCommandHandler.name);

  constructor(private readonly signupsCollection: SignupCollection) {}

  @SentryTraced()
  async execute({ interaction }: LookupCommand): Promise<any> {
    const { options } = interaction;

    const request = this.getLookupRequest(options);
    const results = await this.signupsCollection.findAll(request);

    this.logger.debug(results);

    const embed = this.createLookupEmbed(results);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  private createLookupEmbed(signups: SignupDocument[]) {
    const fields = signups.flatMap(
      ({ notes, world, character, encounter, availability }) => [
        characterField(`${character} @ ${world}`),
        encounterField(encounter),
        {
          name: 'Availability',
          value: availability,
          inline: true,
        },
        {
          name: 'Notes',
          value: notes,
          inline: false,
        },
      ],
    );

    const description = signups.length === 0 ? 'No results found!' : null;
    const color = description ? Colors.Red : Colors.Green;

    return new EmbedBuilder()
      .setTitle('Lookup Results')
      .setDescription(description)
      .setColor(color)
      .addFields(createFields(fields));
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
