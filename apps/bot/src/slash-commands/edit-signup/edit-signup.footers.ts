import type { DiscordService } from '../../discord/discord.service.js';
import { latestEntryOfType } from '../signup/review-history.js';
import type { SignupEditedEvent } from './events/signup-edited.event.js';

type DisplayNames = Pick<DiscordService, 'getDisplayName'>;

/**
 * Footer for an edited review message / announcement. Rebuilt from history on
 * every edit (never appended to), so repeated edits don't chain names.
 */
export async function buildEditedFooterText(
  discordService: DisplayNames,
  {
    kind,
    before,
    editor,
    guildId,
  }: Pick<SignupEditedEvent, 'kind' | 'before' | 'editor' | 'guildId'>,
): Promise<string> {
  const editorName = await discordService.getDisplayName({
    userId: editor.id,
    guildId,
  });

  if (kind === 'reversal') {
    const decliner = await resolveActorName(
      discordService,
      guildId,
      latestEntryOfType(before.reviewHistory, 'declined')?.actorId,
      before.reviewedBy,
    );
    return `Approved by ${editorName} · previously declined by ${decliner}`;
  }

  const approver = await resolveActorName(
    discordService,
    guildId,
    latestEntryOfType(before.reviewHistory, 'approved')?.actorId,
    before.reviewedBy,
  );
  return `Approved by ${approver} · edited by ${editorName}`;
}

// signups reviewed before history tracking only carry a reviewer username
function resolveActorName(
  discordService: DisplayNames,
  guildId: string,
  actorId: string | undefined,
  fallback: string | null | undefined,
): Promise<string> {
  return actorId
    ? discordService.getDisplayName({ userId: actorId, guildId })
    : Promise.resolve(fallback ?? 'unknown');
}
