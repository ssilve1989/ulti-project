import { Module } from '@nestjs/common';
import { ErrorModule } from '../error/error.module.js';
import { ComponentSessionService } from './component-session.service.js';

@Module({
  imports: [ErrorModule],
  providers: [ComponentSessionService],
  exports: [ComponentSessionService],
})
export class ComponentSessionModule {}
