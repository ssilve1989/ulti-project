import { Inject } from '@nestjs/common';
import { SHEETS_CLIENT } from './sheets.consts.js';

export const InjectSheetsClient = () => Inject(SHEETS_CLIENT);
