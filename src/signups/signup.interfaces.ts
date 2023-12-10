import { Encounter } from '../app.consts.js';

export interface SignupRequest {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  fflogsLink: string;
  username: string;
  world: string;
}

export interface Signup extends SignupRequest {
  approved: boolean;
}
