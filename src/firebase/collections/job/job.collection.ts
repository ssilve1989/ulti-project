import { Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../../firebase.decorators.js';
import type { JobDocument } from './job.model.js';

@Injectable()
class JobCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  async getJobs(guildId: string): Promise<JobDocument[]> {
    const res = await this.getCollection(guildId).get();
    return res.empty ? [] : res.docs.map((doc) => doc.data() as JobDocument);
  }

  public async upsertJob(guildId: string, job: JobDocument): Promise<void> {
    await this.getCollection(guildId).doc(job.name).set(job, { merge: true });
  }

  private getCollection(guildId: string) {
    return this.firestore.collection(`guilds/${guildId}/jobs`);
  }
}

export { JobCollection };
