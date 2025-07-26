import { Module } from '@nestjs/common';
import { ErrorService } from './error.service.js';

@Module({
  providers: [ErrorService],
  exports: [ErrorService],
})
export class ErrorModule {}
