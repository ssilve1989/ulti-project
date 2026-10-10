import { Module } from '@nestjs/common';
import { RaidHelperClient } from './raid-helper.client.js';

@Module({ providers: [RaidHelperClient], exports: [RaidHelperClient] })
export class RaidHelperModule {}
