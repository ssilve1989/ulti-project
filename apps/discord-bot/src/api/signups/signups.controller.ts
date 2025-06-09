import { Controller, Get, Sse } from '@nestjs/common';
import { map } from 'rxjs';
import { SignupDocumentCache } from '../../firebase/collections/utils/signup-document.cache.js';

@Controller('signups')
class SignupsController {
  constructor(private readonly cache: SignupDocumentCache) {}

  @Get('stats')
  handleGetSignupStats() {
    return this.cache.getStats();
  }

  @Sse()
  handleSignupsStream() {
    return this.cache.getStream().pipe(
      map((value) => ({
        data: value,
      })),
    );
  }
}

export { SignupsController };
