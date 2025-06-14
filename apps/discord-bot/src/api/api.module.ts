import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { HelpersModule } from './helpers/helpers.module.js';
import { ParticipantsModule } from './participants/participants.module.js';
import { SignupsModule } from './signups/signups.module.js';

/**
 * Used to encapsulate the http API endpoints
 */
@Module({
  imports: [
    AuthModule,
    EventsModule,
    HelpersModule,
    ParticipantsModule,
    SignupsModule,
  ],
})
export class ApiModule {}
