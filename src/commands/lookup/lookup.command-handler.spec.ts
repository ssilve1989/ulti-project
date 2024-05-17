import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SignupDocument } from '../../firebase/models/signup.model.js';
import { LookupCommandHandler } from './lookup.command-handler.js';
import { LookupCommand } from './lookup.command.js';

describe('LookupCommandHandler', () => {
  let handler: LookupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let signupsCollection: DeepMocked<SignupCollection>;
  const getStringMock = vi.fn();

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [LookupCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(LookupCommandHandler);
    signupsCollection = fixture.get(SignupCollection);

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      options: {
        getString: getStringMock,
      },
      valueOf: () => '',
    });
  });

  afterEach(() => {
    getStringMock.mockClear();
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should call the lookup service with the correct parameters', async () => {
    const signups: SignupDocument[] = [
      {
        character: 'aeo arcanist',
        world: 'jenova',
        encounter: Encounter.DSR,
        availability: 'Monday, Wednesday, Friday',
      } as SignupDocument,
    ];

    signupsCollection.findAll.mockResolvedValue(signups);

    const command = new LookupCommand(interaction);

    await handler.execute(command);

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      embeds: [
        EmbedBuilder.from({
          title: 'Lookup Results',
          fields: [
            {
              name: 'Character',
              value: 'Aeo Arcanist @ Jenova',
              inline: true,
            },
            {
              name: 'Encounter',
              value: 'Dragonsong Reprise (Ultimate)',
              inline: true,
            },
            {
              name: 'Availability',
              value: signups[0].availability,
              inline: true,
            },
          ],
        }),
      ],
    });
  });
});
