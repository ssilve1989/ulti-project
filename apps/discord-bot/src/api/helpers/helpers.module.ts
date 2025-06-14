import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../firebase/firebase.module.js';
import { HelpersController } from './helpers.controller.js';
import { HelpersService } from './helpers.service.js';

@Module({
  imports: [FirebaseModule],
  controllers: [HelpersController],
  providers: [HelpersService],
  exports: [HelpersService],
})
export class HelpersModule {}
