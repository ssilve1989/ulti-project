import { Encounter } from '../../app.consts.js';

export interface Signup {
  availability: string;
  character: string;
  encounter: Encounter;
  fflogsLink: string;
}
