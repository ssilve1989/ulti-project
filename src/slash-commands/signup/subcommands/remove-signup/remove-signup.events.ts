import { RemoveSignupDto } from './remove-signup.dto.js';

export class RemoveSignupEvent {
  constructor(
    public readonly dto: RemoveSignupDto,
    public readonly ids: { discordId: string; guildId: string },
  ) {}
}
