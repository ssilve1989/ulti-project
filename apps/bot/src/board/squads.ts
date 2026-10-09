import type { SettingsDocument, SquadConfig } from '@ulti-project/shared';
import { roleMention } from 'discord.js';

export type { SquadConfig } from '@ulti-project/shared';

export type SquadValidation =
  | { ok: true; squad: SquadConfig }
  | { ok: false; message: string };

const TAG = /^[A-Z0-9]{2,4}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** The id a squad is stored under in `SettingsDocument.squads`. */
export function squadIdOf(tag: string): string {
  return tag.toLowerCase();
}

/**
 * Checks a squad an admin wants to add against the guild's `existing` squads,
 * normalising its tag to upper case and its colour to lower case.
 */
export function validateSquad(
  input: { name: string; tag: string; color: string; roleId: string },
  existing: Readonly<Record<string, SquadConfig>>,
): SquadValidation {
  const tag = input.tag.trim().toUpperCase();
  if (!TAG.test(tag)) {
    return {
      ok: false,
      message: 'Squad tags are 2–4 letters or digits, like FRG.',
    };
  }
  if (!COLOR.test(input.color)) {
    return { ok: false, message: 'Colours look like #16a34a.' };
  }
  if (existing[squadIdOf(tag)]) {
    return { ok: false, message: `${tag} is already a squad.` };
  }
  const roleOwner = Object.values(existing).find(
    (squad) => squad.roleId === input.roleId,
  );
  if (roleOwner) {
    return {
      ok: false,
      message: `${roleMention(input.roleId)} already belongs to ${roleOwner.name}.`,
    };
  }
  return {
    ok: true,
    squad: {
      name: input.name,
      tag,
      color: input.color.toLowerCase(),
      roleId: input.roleId,
    },
  };
}

/** The guild's squads with their ids, ordered by tag. */
export function squadsOf(
  settings: SettingsDocument | undefined,
): ReadonlyArray<SquadConfig & { id: string }> {
  return Object.entries(settings?.squads ?? {})
    .map(([id, squad]) => ({ id, ...squad }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
