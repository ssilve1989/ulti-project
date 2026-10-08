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
  end: () => void;
  /** What the session sends Discord to edit the reply. */
  editReply: ReturnType<typeof vi.fn>;
}

/** A session on a message, started from a button. */
function startSession({
  clearEmbedsOnExpiry,
}: {
  clearEmbedsOnExpiry?: boolean;
} = {}): Session {
  const fake = new FakeMessage(
    'message-1',
    { kind: 'channel', guildId: 'guild-1', channelId: 'channel-1' },
    'bot',
    'Pick one',
    () => {},
  );
  const message = fake.toMessage<true>();
  const onExpired = vi.fn();
  const editReply = vi.fn().mockResolvedValue(undefined);
  const interaction = mockOf<ButtonInteraction<'cached'>>({
    user: { id: 'user-1' },
    editReply,
  });

  vi.spyOn(message, 'createMessageComponentCollector');
  const end = new ComponentSessionService(createAutoMock<ErrorService>()).run(
    interaction,
    message,
    {
      name: 'test',
      expiredContent: 'Expired',
      onCollect: () => Promise.resolve(),
      onExpired,
      ...(clearEmbedsOnExpiry !== undefined && { clearEmbedsOnExpiry }),
    },
  );

  return { fake, message, onExpired, end, editReply };
}

const it = base.extend<{ session: Session; clearingSession: Session }>({
  session: fresh(() => startSession()),
  clearingSession: fresh(() => startSession({ clearEmbedsOnExpiry: true })),
});

describe('when a component session times out', () => {
  it('calls onExpired once', ({ session }) => {
    session.fake.expire();

    expect(session.onExpired).toHaveBeenCalledTimes(1);
  });

  it('replaces the content and removes the components, keeping the embeds', async ({
    session,
  }) => {
    session.fake.expire();

    await vi.waitFor(() => expect(session.editReply).toHaveBeenCalled());
    expect(session.editReply.mock.calls).toEqual([
      [{ content: 'Expired', components: [] }],
    ]);
  });
});

describe('when a session that clears its embeds on expiry times out', () => {
  it('removes the embeds too', async ({ clearingSession }) => {
    clearingSession.fake.expire();

    await vi.waitFor(() =>
      expect(clearingSession.editReply).toHaveBeenCalled(),
    );
    expect(clearingSession.editReply.mock.calls).toEqual([
      [{ content: 'Expired', embeds: [], components: [] }],
    ]);
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

describe('when a component session is ended before it times out', () => {
  it('stops collecting and never expires', ({ session }) => {
    session.end();
    session.fake.expire();

    expect({
      collecting: session.fake.isCollected(),
      expired: vi.mocked(session.onExpired).mock.calls.length,
    }).toEqual({ collecting: false, expired: 0 });
  });
});
