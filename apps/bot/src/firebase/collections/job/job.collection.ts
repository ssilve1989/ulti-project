import { Injectable } from '@nestjs/common';
import { typedCollection } from '@ulti-project/shared';
import type { Firestore } from 'firebase-admin/firestore';
import type { JobType } from '../../../jobs/jobs.consts.js';
import { InjectFirestore } from '../../firebase.decorators.js';
import type { JobDocument } from './job.model.js';

@Injectable()
class JobCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  async getJobs(guildId: string): Promise<JobDocument[]> {
    const res = await this.getCollection(guildId).get();
    return res.empty ? [] : res.docs.map((doc) => doc.data());
  }

  async getJob(
    guildId: string,
    jobName: JobType,
  ): Promise<JobDocument | undefined> {
    const doc = await this.getCollection(guildId).doc(jobName).get();
    return doc.data();
  }

  public async upsertJob(guildId: string, job: JobDocument): Promise<void> {
    await this.getCollection(guildId).doc(job.name).set(job, { merge: true });
  }

  private getCollection(guildId: string) {
    return typedCollection<JobDocument>(
      this.firestore,
      `guilds/${guildId}/jobs`,
    );
  }
}

export { JobCollection };
