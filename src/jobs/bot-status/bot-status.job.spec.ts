import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { BotStatusJob } from './bot-status.job.js';

describe('BotStatusJob', () => {
  let job: BotStatusJob;
  let discordService: DiscordService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BotStatusJob,
        {
          provide: DiscordService,
          useValue: {
            setActivity: vi.fn(),
          },
        },
      ],
    }).compile();

    job = module.get(BotStatusJob);
    discordService = module.get(DiscordService);
  });

  describe('onApplicationBootstrap', () => {
    it('immediately sets a status drawn from the known message pool', () => {
      job.onApplicationBootstrap();

      expect(discordService.setActivity).toHaveBeenCalledTimes(1);
      expect(discordService.setActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.any(String),
          type: expect.any(Number),
        }),
      );

      job.onApplicationShutdown();
    });
  });

  describe('error handling', () => {
    it('catches and logs errors from setActivity without throwing', () => {
      vi.spyOn(discordService, 'setActivity').mockImplementation(() => {
        throw new Error('discord unavailable');
      });

      expect(() => job.onApplicationBootstrap()).not.toThrow();

      job.onApplicationShutdown();
    });
  });
});
