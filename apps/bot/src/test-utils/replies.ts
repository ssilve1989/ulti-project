import { Colors } from 'discord.js';
import type { FlowApp } from './flow-app.js';
import { isoDateSince } from './matchers.js';

/** Where an answer to one of `userId`'s interactions shows. */
export const replyTo = (
  userId: string,
  { ephemeral }: { ephemeral: boolean },
) => ({ kind: 'reply', userId, ephemeral });

/** A text-only answer to one of `userId`'s interactions, as `shown()` gives it. */
export const textReply = (
  userId: string,
  content: string,
  { ephemeral }: { ephemeral: boolean },
) => ({
  location: replyTo(userId, { ephemeral }),
  reactions: {},
  deleted: false,
  content,
  embeds: [],
  components: [],
});

/** The embed a command answers with when it fails unexpectedly. */
export const commandErrorEmbed = (flow: FlowApp) => ({
  title: 'Command Error',
  description: 'An unexpected error occurred. Please try again later.',
  color: Colors.Red,
  timestamp: isoDateSince(flow.startedAt),
});

/** A command's private answer when it fails unexpectedly. */
export const commandErrorReply = (flow: FlowApp, userId: string) => ({
  location: replyTo(userId, { ephemeral: true }),
  reactions: {},
  deleted: false,
  content: undefined,
  embeds: [commandErrorEmbed(flow)],
  components: [],
});

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Declares what a command reports when it fails with an error whose message
 * starts with `message` (e.g. `14 UNAVAILABLE`): the exception sent to Sentry,
 * the error logged, and the command it failed in.
 */
export function expectCommandErrorReported(flow: FlowApp, message: string) {
  // how an error prints: its class, any code, and its message
  const error = `\\w*Error(?: \\[\\w+\\])?: ${escaped(message)}`;
  flow.expectReported(new RegExp(`^Sentry exception: ${error}`));
  flow.expectReported(new RegExp(`^error: \\{\\n\\s+err: ${error}`));
  flow.expectReported(
    new RegExp(`^error: .*Command error: ${escaped(message)}`, 's'),
  );
}
