import { Job, Role } from '@ulti-project/shared';

const tankJobs = new Set([
  Job.Paladin,
  Job.Warrior,
  Job.DarkKnight,
  Job.Gunbreaker,
]);

const healerJobs = new Set([
  Job.WhiteMage,
  Job.Scholar,
  Job.Astrologian,
  Job.Sage,
]);

export function getJobRole(job: Job): Role {
  if (tankJobs.has(job)) return Role.Tank;
  if (healerJobs.has(job)) return Role.Healer;
  return Role.DPS;
}
