import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  Colors,
  CommandInteractionOptionResolver,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { titleCase } from 'title-case';
import { encounterField } from '../../common/components/fields.js';
import { createFields } from '../../common/embed-helpers.js';
import { BlacklistCollection } from '../../firebase/collections/blacklist-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { LookupCommand } from './lookup.command.js';
import { type LookupSchema, lookupSchema } from './lookup.schema.js';

type BlacklistStatus = 'No' | 'Yes' | 'Unknown';
type SignupWithBlacklistStatus = SignupDocument & {
  blacklistStatus: BlacklistStatus;
};

@CommandHandler(LookupCommand)
class LookupCommandHandler implements ICommandHandler<LookupCommand> {
  private readonly logger = new Logger(LookupCommandHandler.name);

  constructor(
    private readonly signupsCollection: SignupCollection,
    private readonly blacklistCollection: BlacklistCollection,
  ) {}

  @SentryTraced()
  async execute({ interaction }: LookupCommand): Promise<void> {
    const { options, guildId } = interaction;

    const dto = this.getLookupRequest(options);
    const results = await this.signupsCollection.findAll(dto);

    const withBlacklistInfo = await Promise.all(
      results.map((r) => this.mapBlacklistInfo(guildId, r)),
    );

    this.logger.debug(results);

    const embeds = this.createLookupEmbeds(withBlacklistInfo, dto);
    await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  }

  private async mapBlacklistInfo(
    guildId: string,
    signup: SignupDocument,
  ): Promise<SignupWithBlacklistStatus> {
    const match = await this.blacklistCollection
      .search({
        characterName: signup.character,
        discordId: signup.discordId,
        guildId,
      })
      .catch((err) => {
        sentryReport(err);
        return { ...signup, blacklistStatus: 'Unknown' };
      });

    return {
      ...signup,
      blacklistStatus: match ? 'Yes' : 'No',
    };
  }

  private createLookupEmbeds(
    signups: SignupWithBlacklistStatus[],
    dto: LookupSchema,
  ) {
    if (signups.length === 0) {
      return [
        new EmbedBuilder()
          .setTitle('Lookup Results')
          .setDescription('No results found!')
          .setColor(Colors.Red),
      ];
    }

    const groupedByWorld = signups.reduce<
      Record<string, SignupWithBlacklistStatus[]>
    >((acc, signup) => {
      if (acc[signup.world]) {
        acc[signup.world].push(signup);
      } else {
        acc[signup.world] = [signup];
      }
      return acc;
    }, {});

    const embeds = Object.entries(groupedByWorld).map(([world, signups]) => {
      const fields = signups.flatMap(
        ({ progPoint, notes, encounter, availability, blacklistStatus }) => [
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
          { name: 'Blacklisted', value: blacklistStatus, inline: true },
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
    const character = options.getString('character', true);
    const world = options.getString('world');

    return lookupSchema.parse({ character, world });
  }
}

export { LookupCommandHandler };
