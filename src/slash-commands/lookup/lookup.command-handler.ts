import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { plainToInstance } from 'class-transformer';
import {
  Colors,
  CommandInteractionOptionResolver,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { titleCase } from 'title-case';
import { encounterField } from '../../common/components/fields.js';
import { createFields } from '../../common/embed-helpers.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { SentryTraced } from '../../sentry/sentry-traced.decorator.js';
import { LookupCommand } from './lookup.command.js';
import { LookupInteractionDto } from './lookup.dto.js';

@CommandHandler(LookupCommand)
class LookupCommandHandler implements ICommandHandler<LookupCommand> {
  private readonly logger = new Logger(LookupCommandHandler.name);

  constructor(private readonly signupsCollection: SignupCollection) {}

  @SentryTraced()
  async execute({ interaction }: LookupCommand): Promise<any> {
    const { options } = interaction;

    const dto = this.getLookupRequest(options);
    const results = await this.signupsCollection.findAll(dto);

    this.logger.debug(results);

    const embeds = this.createLookupEmbeds(results, dto);
    await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  }

  private createLookupEmbeds(
    signups: SignupDocument[],
    dto: LookupInteractionDto,
  ) {
    if (signups.length === 0) {
      return [
        new EmbedBuilder()
          .setTitle('Lookup Results')
          .setDescription('No results found!')
          .setColor(Colors.Red),
      ];
    }

    const groupedByWorld = signups.reduce(
      (acc, signup) => {
        if (acc[signup.world]) {
          acc[signup.world].push(signup);
        } else {
          acc[signup.world] = [signup];
        }
        return acc;
      },
      {} as Record<string, SignupDocument[]>,
    );

    const embeds = Object.entries(groupedByWorld).map(([world, signups]) => {
      const fields = signups.flatMap(
        ({ progPoint, notes, encounter, availability }) => [
          encounterField(encounter),
          {
            name: 'Prog Point',
            value: progPoint,
            inline: true,
          },
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

      const color = Colors.Green;

      const titleCharacter = titleCase(`${dto.character} @ ${world}`);

      return new EmbedBuilder()
        .setTitle(`Lookup Results for ${titleCharacter}`)
        .setColor(color)
        .addFields(createFields(fields));
    });

    return embeds;
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
