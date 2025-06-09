import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { SignupsModule } from './signups/signups.module.js';

/**
 * Used to encapsulate the http API endpoints
 */
@Module({
  imports: [AuthModule, SignupsModule],
})
export class ApiModule {}
