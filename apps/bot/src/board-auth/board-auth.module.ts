import { Module } from '@nestjs/common';
import { boardConfig } from '../config/board.js';
import { BOARD_AUTH, createBoardAuth } from './auth.js';

@Module({
  providers: [
    { provide: BOARD_AUTH, useFactory: () => createBoardAuth(boardConfig) },
  ],
  exports: [BOARD_AUTH],
})
export class BoardAuthModule {}
