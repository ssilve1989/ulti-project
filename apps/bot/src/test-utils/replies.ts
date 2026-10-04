import { Colors } from 'discord.js';
import type { FlowApp } from './flow-app.js';
import { isoDateSince } from './matchers.js';

/** Where an answer to one of `userId`'s interactions shows. */
export const replyTo = (
  userId: string,
  { ephemeral }: { ephemeral: boolean },
) => ({ kind: 'reply', userId, ephemeral });

/** A private answer to one of `userId`'s interactions, as `shown()` gives it. */
export const privateReply = (
  userId: string,
  {
    content,
    embeds = [],
    components = [],
  }: { content?: string; embeds?: unknown[]; components?: unknown[] } = {},
) => ({
  location: replyTo(userId, { ephemeral: true }),
  reactions: {},
  deleted: false,
  content,
  embeds,
  components,
});

/** A text-only answer to one of `userId`'s interactions, which may be public. */
export const textReply = (
  userId: string,
  content: string,
  { ephemeral }: { ephemeral: boolean },
) => ({
  ...privateReply(userId, { content }),
  location: replyTo(userId, { ephemeral }),
});

/** The embed a command answers with when it fails unexpectedly. */
const commandErrorEmbed = (flow: FlowApp) => ({
  title: 'Command Error',
  description: 'An unexpected error occurred. Please try again later.',
  color: Colors.Red,
  timestamp: isoDateSince(flow.startedAt),
});

/** A command's private answer when it fails unexpectedly. */
export const commandErrorReply = (flow: FlowApp, userId: string) =>
  privateReply(userId, { embeds: [commandErrorEmbed(flow)] });

/**
 * Declares what a command reports when it fails with an error whose message
 * starts with `message` (e.g. `14 UNAVAILABLE`): the exception sent to Sentry,
 * the error logged, and the command it failed in.
 */
export function expectCommandErrorReported(flow: FlowApp, message: string) {
  const error = printedError(message);
  flow.expectReported(new RegExp(`^Sentry exception: ${error}`));
  flow.expectReported(new RegExp(`^error: \\{\\n\\s+err: ${error}`));
  flow.expectReported(
    new RegExp(`^error: .*Command error: ${RegExp.escape(message)}`, 's'),
  );
}

/**
 * Declares what an event handler reports when it fails with an error whose
 * message starts with `message` (e.g. `Unknown Channel`): CQRS logs it, and
 * AppService sends it to Sentry and logs it.
 */
export function expectEventHandlerErrorReported(
  flow: FlowApp,
  message: string,
) {
  const error = printedError(message);
  flow.expectReported(
    new RegExp(`^error: ".*" has thrown an unhandled exception\\. ${error}`),
  );
  flow.expectReported(new RegExp(`^Sentry exception: ${error}`));
  flow.expectReported(new RegExp(`^error: \\{\\n\\s+err: ${error}`));
}

/**
 * How an error prints: its class, any code (`Error [CODE]`, or discord.js's
 * `DiscordAPIError[10003]`), and its message.
 */
function printedError(message: string): string {
  return `\\w*Error(?: ?\\[\\w+\\])?: ${RegExp.escape(message)}`;
}
