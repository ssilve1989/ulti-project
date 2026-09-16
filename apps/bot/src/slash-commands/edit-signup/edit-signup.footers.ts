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
  const decisionType = kind === 'reversal' ? 'declined' : 'approved';

  // independent lookups: resolve them together rather than back to back
  const [editorName, actorName] = await Promise.all([
    discordService.getDisplayName({ userId: editor.id, guildId }),
    resolveActorName(
      discordService,
      guildId,
      latestEntryOfType(before.reviewHistory, decisionType)?.actorId,
      before.reviewedBy,
    ),
  ]);

  return kind === 'reversal'
    ? `Approved by ${editorName} · previously declined by ${actorName}`
    : `Approved by ${actorName} · edited by ${editorName}`;
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
