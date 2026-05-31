import { Encounter } from '../../../encounters/encounters.consts.js';

// TODO: Extract into a role manager module with the other role related side-effects?
export class RemoveRolesCommand {
  constructor(
    public readonly guildId: string,
    public readonly userId: string,
    public readonly encounter: Encounter,
  ) {}
}
