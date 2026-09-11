import { Test } from '@nestjs/testing';
import {
  Collection,
  type Message,
  type MessageReaction,
  type User,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockOf } from '../test-utils/mock-factory.js';
import { DISCORD_CLIENT } from './discord.decorators.js';
import { DiscordService } from './discord.service.js';

describe('DiscordService', () => {
  let service: DiscordService;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [DiscordService, { provide: DISCORD_CLIENT, useValue: {} }],
    }).compile();

    service = fixture.get(DiscordService);
  });

  describe('clearHumanReactions', () => {
    const makeReaction = (users: User[]): MessageReaction =>
      mockOf<MessageReaction>({
        users: mockOf<MessageReaction['users']>({
          fetch: vi
            .fn()
            .mockResolvedValue(
              new Collection(users.map((user) => [user.id, user])),
            ),
          remove: vi.fn().mockResolvedValue(undefined),
        }),
      });

    it('removes every non-bot reactor while leaving bot reactions untouched', async () => {
      const human = mockOf<User>({ id: 'human-1', bot: false });
      const bot = mockOf<User>({ id: 'bot-1', bot: true });
      const approveReaction = makeReaction([human, bot]);
      const declineReaction = makeReaction([bot]);

      const message = mockOf<Message>({
        reactions: mockOf<Message['reactions']>({
          cache: new Collection([
            ['✅', approveReaction],
            ['❌', declineReaction],
          ]),
        }),
      });

      await service.clearHumanReactions(message);

      expect(approveReaction.users.remove).toHaveBeenCalledWith('human-1');
      expect(approveReaction.users.remove).not.toHaveBeenCalledWith('bot-1');
      expect(declineReaction.users.remove).not.toHaveBeenCalled();
    });

    it('does nothing when a reaction has no reactors', async () => {
      const emptyReaction = makeReaction([]);

      const message = mockOf<Message>({
        reactions: mockOf<Message['reactions']>({
          cache: new Collection([['✅', emptyReaction]]),
        }),
      });

      await service.clearHumanReactions(message);

      expect(emptyReaction.users.remove).not.toHaveBeenCalled();
    });
  });
});
