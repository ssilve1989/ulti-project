import type { ButtonInteraction, Message } from 'discord.js';
import { test as base, describe, expect, vi } from 'vitest';
import type { ErrorService } from '../error/error.service.js';
import { FakeMessage } from '../test-utils/discord/fake-message.js';
import { fresh } from '../test-utils/fixtures.js';
import { createAutoMock, mockOf } from '../test-utils/mock-factory.js';
import { ComponentSessionService } from './component-session.service.js';

interface Session {
  fake: FakeMessage;
  message: Message<true>;
  onExpired: () => void;
}

/** A session on a message, started from a button. */
function startSession(): Session {
  const fake = new FakeMessage(
    'message-1',
    { kind: 'channel', guildId: 'guild-1', channelId: 'channel-1' },
    'bot',
    'Pick one',
    () => {},
  );
  const message = fake.toMessage<true>();
  const onExpired = vi.fn();
  const interaction = mockOf<ButtonInteraction<'cached'>>({
    user: { id: 'user-1' },
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  vi.spyOn(message, 'createMessageComponentCollector');
  new ComponentSessionService(createAutoMock<ErrorService>()).run(
    interaction,
    message,
    {
      name: 'test',
      expiredContent: 'Expired',
      onCollect: () => Promise.resolve(),
      onExpired,
    },
  );

  return { fake, message, onExpired };
}

const it = base.extend<{ session: Session }>({
  session: fresh(startSession),
});

describe('when a component session times out', () => {
  it('calls onExpired once', ({ session }) => {
    session.fake.expire();

    expect(session.onExpired).toHaveBeenCalledTimes(1);
  });
});

describe('when a component session ends because its message was deleted', () => {
  it('does not call onExpired', ({ session }) => {
    const collector = vi
      .mocked(session.message.createMessageComponentCollector)
      .mock.results.at(0);
    if (collector?.type !== 'return') throw new Error('no collector');

    collector.value.stop('messageDelete');

    expect(session.onExpired).not.toHaveBeenCalled();
  });
});
