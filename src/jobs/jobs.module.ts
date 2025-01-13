import { Module } from '@nestjs/common';
import { ClearCheckerModule } from './clear-checker/clear-checker.module.js';

@Module({
  imports: [ClearCheckerModule],
})
export class JobsModule {}
