const CUSTOM_EMOJI = /^<:\w{2,32}:(\d{17,20})>$/;
const ANIMATED_EMOJI = /^<a:\w{2,32}:\d{17,20}>$/;
const SNOWFLAKE = /^(\d{17,20})$/;

/** A static custom emoji's id, from its mention (`<:name:id>`) or the bare id. */
export function parseEmojiId(input: string): string | undefined {
  const trimmed = input.trim();
  return (CUSTOM_EMOJI.exec(trimmed) ?? SNOWFLAKE.exec(trimmed))?.[1];
}

/** Whether the input is an animated custom emoji's mention (`<a:name:id>`). */
export function isAnimatedEmoji(input: string): boolean {
  return ANIMATED_EMOJI.test(input.trim());
}
