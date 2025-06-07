import { Controller, Sse } from '@nestjs/common';
import { map } from 'rxjs';
import { SignupDocumentCache } from './collections/utils/signup-document.cache.js';

@Controller('firestore')
class FirebaseController {
  constructor(private readonly cache: SignupDocumentCache) {}

  // TODO: can add serialize decorator to exclude fields perhaps?
  @Sse('signups')
  async getSignups() {
    return this.cache.getStream().pipe(
      map((value) => ({
        data: value,
      })),
    );
  }
}

export { FirebaseController };
