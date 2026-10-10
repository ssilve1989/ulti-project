const TIMESTAMP = /^(?:<t:(\d{9,11})(?::[tTdDfFR])?>|(\d{9,11}))$/;

/** Unix seconds, or a Discord timestamp token (`<t:1760000000:F>`). */
export function parseDiscordTime(input: string): Date | undefined {
  const match = TIMESTAMP.exec(input.trim());
  const seconds = match?.[1] ?? match?.[2];
  return seconds === undefined ? undefined : new Date(Number(seconds) * 1000);
}
