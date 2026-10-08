import { Encounter } from '@ulti-project/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import { ComponentSessionService } from '../../discord/component-session.service.js';
import type { ErrorService } from '../../error/error.service.js';
import { FakeMessage } from '../../test-utils/discord/fake-message.js';
import { createAutoMock, mockOf } from '../../test-utils/mock-factory.js';
import type { ScheduleDraft } from './schedule-panel.renderer.js';
import { SchedulePanelSession } from './schedule-panel.session.js';

const DRAFT: ScheduleDraft = Object.freeze({
  title: 'DSR prog night',
  encounters: [Encounter.DSR],
  channelId: 'channel-1',
  weekdays: [],
  startTime: '20:00',
  timeZone: USTimeZones.EASTERN,
  postLeadHours: 72,
  signupsCloseBeforeHours: 0,
});

describe('when the schedule panel ends because its message was deleted', () => {
  it('resolves with nothing picked', async () => {
    const panel = new FakeMessage(
      'panel-1',
      { kind: 'channel', guildId: 'guild-1', channelId: 'channel-1' },
      'bot',
      'Schedule panel',
      () => {},
    ).toMessage<true>();
    const collect = vi.spyOn(panel, 'createMessageComponentCollector');
    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      user: { id: 'organizer-1' },
      editReply: vi.fn().mockResolvedValue(panel),
    });
    const session = new SchedulePanelSession(
      new ComponentSessionService(createAutoMock<ErrorService>()),
    );

    const opened = session.open(interaction, DRAFT, 'create');
    await vi.waitFor(() => expect(collect).toHaveBeenCalled());
    const collector = collect.mock.results.at(0);
    if (collector?.type !== 'return') throw new Error('no collector');
    collector.value.stop('messageDelete');

    const outcome = await Promise.race([
      opened.then((draft) => ({ draft })),
      new Promise((resolve) => setImmediate(() => resolve('still open'))),
    ]);
    expect(outcome).toEqual({ draft: undefined });
  });
});
