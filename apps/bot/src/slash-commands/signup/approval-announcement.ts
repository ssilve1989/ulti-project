import {
  EncounterFriendlyDescription,
  type SignupDocument,
} from '@ulti-project/shared';
import { Colors, EmbedBuilder, userMention } from 'discord.js';
import {
  characterField,
  emptyField,
  worldField,
} from '../../common/components/fields.js';
import { hasClearedStatus } from './signup.utils.js';

type AnnouncementSignup = Pick<
  SignupDocument,
  | 'character'
  | 'discordId'
  | 'encounter'
  | 'partyStatus'
  | 'progPoint'
  | 'progPointRequested'
  | 'proofOfProgLink'
  | 'role'
  | 'screenshot'
  | 'world'
>;

export interface ApprovalAnnouncementEmbedInput {
  signup: AnnouncementSignup;
  encounterEmoji: string;
  footer: { text: string; iconURL: string };
  applicantAvatarUrl?: string;
}

/**
 * The public "Signup Approved" / "Congratulations!" embed. Shared by the
 * reaction approval flow and /edit-signup so both produce identical posts.
 */
export function buildApprovalAnnouncementEmbed({
  signup,
  encounterEmoji,
  footer,
  applicantAvatarUrl,
}: ApprovalAnnouncementEmbedInput): EmbedBuilder {
  const {
    encounter,
    character,
    world,
    role,
    progPoint,
    progPointRequested,
    proofOfProgLink,
    screenshot,
  } = signup;

  const title = hasClearedStatus(signup)
    ? 'Congratulations!'
    : `Signup Approved - ${EncounterFriendlyDescription[encounter]} ${encounterEmoji}`.trim();

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setFields([
      characterField(character),
      worldField(world),
      { name: 'Job', value: role, inline: true },
      {
        name: 'Prog Point',
        value: progPoint ?? progPointRequested,
        inline: true,
      },
      emptyField(),
    ])
    .setFooter(footer)
    .setColor(Colors.Green)
    .setTimestamp(new Date());

  if (proofOfProgLink) {
    embed.addFields([
      {
        name: 'Prog Proof Link',
        value: `[View](${proofOfProgLink})`,
        inline: true,
      },
    ]);
  }

  if (screenshot) {
    embed.setImage(screenshot);
  }

  return applicantAvatarUrl ? embed.setThumbnail(applicantAvatarUrl) : embed;
}

export function buildApprovalAnnouncementContent(
  signup: Pick<SignupDocument, 'discordId' | 'encounter' | 'partyStatus'>,
): string {
  const message = hasClearedStatus(signup)
    ? `Congratulations on clearing **${EncounterFriendlyDescription[signup.encounter]}**!`
    : 'Signup Approved!';

  return `${userMention(signup.discordId)} ${message}`;
}
