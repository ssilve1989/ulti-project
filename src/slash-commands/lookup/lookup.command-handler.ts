import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  Colors,
  CommandInteractionOptionResolver,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { titleCase } from 'title-case';
import { z } from 'zod';
import { encounterField } from '../../common/components/fields.js';
import { createFields } from '../../common/embed-helpers.js';
import { ErrorService } from '../../error/error.service.js';
import { BlacklistCollection } from '../../firebase/collections/blacklist-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { LookupCommand } from './lookup.command.js';
import { type LookupSchema, lookupSchema } from './lookup.schema.js';

type BlacklistStatus = 'No' | 'Yes' | 'Unknown';
type SignupWithBlacklistStatus = SignupDocument & {
  blacklistStatus: BlacklistStatus;
};

@CommandHandler(LookupCommand)
class LookupCommandHandler implements ICommandHandler<LookupCommand> {
  constructor(
    private readonly signupsCollection: SignupCollection,
    private readonly blacklistCollection: BlacklistCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: LookupCommand): Promise<void> {
    try {
      const { options, guildId } = interaction;

      const lookupResult = this.getLookupRequest(options);

      if (!lookupResult.success) {
        const errorEmbed = this.createValidationErrorEmbed(lookupResult.error);
        await interaction.reply({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const dto = lookupResult.data;

      // Add command-specific context
      Sentry.setContext('lookup_request', {
        character: dto.character,
        world: dto.world,
      });

      const results = await this.signupsCollection.findAll(dto);

      const withBlacklistInfo = await Promise.all(
        results.map((r) => this.mapBlacklistInfo(guildId, r)),
      );

      // Add context about results
      Sentry.setContext('lookup_results', {
        signupCount: results.length,
        worlds: [...new Set(results.map((r) => r.world))],
      });

      const embeds = this.createLookupEmbeds(withBlacklistInfo, dto);
      await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async mapBlacklistInfo(
    guildId: string,
    signup: SignupDocument,
  ): Promise<SignupWithBlacklistStatus> {
    try {
      const match = await this.blacklistCollection.search({
        characterName: signup.character,
        discordId: signup.discordId,
        guildId,
      });

      return {
        ...signup,
        blacklistStatus: match ? 'Yes' : 'No',
      };
    } catch (err) {
      // Report blacklist lookup error but don't fail the entire lookup
      this.errorService.captureError(err);
      return { ...signup, blacklistStatus: 'Unknown' };
    }
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
          { name: 'Blacklisted', value: blacklistStatus, inline: !!notes },
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

  private createValidationErrorEmbed(
    error: z.ZodError<LookupSchema>,
  ): EmbedBuilder {
    const tree = z.treeifyError(error);
    const errorMessages: string[] = [];

    if (tree.properties?.world) {
      errorMessages.push(
        `**World**: ${tree.properties.world.errors.join(', ')}`,
      );
    }
    if (tree.properties?.character) {
      errorMessages.push(
        `**Character**: ${tree.properties.character.errors.join(', ')}`,
      );
    }

    const description =
      errorMessages.length > 0 ? errorMessages.join('\n') : 'Validation failed';

    return new EmbedBuilder()
      .setTitle('Validation Error')
      .setDescription(description)
      .setColor(Colors.Red);
  }

  private getLookupRequest(
    options: Omit<
      CommandInteractionOptionResolver<'cached' | 'raw'>,
      'getMessage' | 'getFocused'
    >,
  ) {
    const character = options.getString('character', true);
    const world = options.getString('world');

    return lookupSchema.safeParse({ character, world });
  }
}

export { LookupCommandHandler };
