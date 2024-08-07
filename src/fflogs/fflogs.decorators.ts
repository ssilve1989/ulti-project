import { Inject } from '@nestjs/common';
import { getFflogsSdkToken } from './fflogs.consts.js';

export const InjectFFLogsSDKClient = () => Inject(getFflogsSdkToken());
