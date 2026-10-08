import { Encounter } from '@ulti-project/shared';
import { test as base, describe, expect, vi } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { eventButtonRow } from '../../test-utils/events.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';

const GUILD = 'guild-1';
const EVENTS_CHANNEL = 'events-channel';
const ORGANIZER_ROLE = 'organizer-role';
const ORGANIZER = Object.freeze({
  id: 'organizer-1',
  username: 'organizer',
  roles: [ORGANIZER_ROLE],
});

const TITLE = 'DMU prog night';
const NOW = new Date('2026-10-07T16:00:00Z');
const START_S = new Date('2026-10-12T16:00:00Z').getTime() / 1000;

/** Boots the app at NOW, with the events channel and an organizer. */
async function startFlow(): Promise<FlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp();
    flow.discord.addChannel(GUILD, EVENTS_CHANNEL);
    flow.discord.addRole(GUILD, { id: ORGANIZER_ROLE, name: 'Organizer' });
    flow.discord.addMember(ORGANIZER);
    flow.db.seed(`settings/${GUILD}`, {
      eventOrganizerRoles: [ORGANIZER_ROLE],
    });
    return flow;
  } catch (error) {
    vi.useRealTimers();
    throw error;
  }
}

async function stopFlow(flow: FlowApp): Promise<void> {
  try {
    await flow.close();
  } finally {
    vi.useRealTimers();
  }
}

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(startFlow, stopFlow),
});

/** The organizer creates the DMU event, and the bot finishes posting it. */
async function createEvent(flow: FlowApp) {
  flow.discord.command({
    userId: ORGANIZER.id,
    guildId: GUILD,
    channelId: EVENTS_CHANNEL,
    commandName: 'event',
    subcommand: 'create',
    options: {
      title: TITLE,
      start: `<t:${START_S}:F>`,
      'encounter-1': Encounter.DMU,
    },
  });
  await flow.settle();
}

function onlyEventId(flow: FlowApp): string {
  const [event, ...others] = flow.db.documentsIn('events');
  if (event === undefined || others.length > 0) {
    throw new Error('expected one event');
  }
  return event.id;
}

describe('when an organizer posts an event', () => {
  it.beforeEach(({ flow }) => createEvent(flow));

  it('shows members the Sign up and Withdraw buttons', ({ flow }) => {
    expect(flow.discord.channel(EVENTS_CHANNEL).map(shown)).toEqual([
      {
        location: {
          kind: 'channel',
          guildId: GUILD,
          channelId: EVENTS_CHANNEL,
        },
        content: undefined,
        embeds: [
          {
            title: TITLE,
            description: [
              `<t:${START_S}:F> (<t:${START_S}:R>)`,
              `Organized by <@${ORGANIZER.id}>`,
            ].join('\n'),
            fields: [
              { name: '__Dancing Mad (Ultimate)__', value: 'No sign-ups yet' },
            ],
          },
        ],
        components: [
          eventButtonRow(onlyEventId(flow), { signup: true, withdraw: true }),
        ],
        reactions: {},
        deleted: false,
      },
    ]);
  });
});
