import { Encounter } from '../app.consts.js';

export interface Signup {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  fflogsLink: string;
  username: string;
  world: string;
}
