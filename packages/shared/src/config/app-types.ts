export const APPLICATION_MODES = ['savage', 'ultimate', 'legacy'] as const;

export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export type ApplicationModeConfig = ApplicationMode[];
