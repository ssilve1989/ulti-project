import type { RemoveSignupSchema } from './remove-signup.schema.js';

export class RemoveSignupEvent {
  constructor(
    public readonly dto: RemoveSignupSchema,
    public readonly ids: { discordId: string; guildId: string },
  ) {}
}
