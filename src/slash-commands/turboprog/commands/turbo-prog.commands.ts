import type { ICommand } from '@nestjs/cqrs';
import type { TurboProgEntry } from '../turbo-prog.interfaces.js';

export class TurboProgRemoveSignupCommand implements ICommand {
  constructor(
    public readonly entry: Pick<TurboProgEntry, 'encounter' | 'character'>,
    public readonly guildId: string,
  ) {}
}
