const CUSTOM_EMOJI = /^<a?:\w{2,32}:(\d{17,20})>$/;
const SNOWFLAKE = /^(\d{17,20})$/;

/** A custom emoji's id, from its mention (`<:name:id>`) or the bare id. */
export function parseEmojiId(input: string): string | undefined {
  const trimmed = input.trim();
  return (CUSTOM_EMOJI.exec(trimmed) ?? SNOWFLAKE.exec(trimmed))?.[1];
}
