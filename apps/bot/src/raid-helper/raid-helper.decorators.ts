import { Inject } from '@nestjs/common';
import { getRaidHelperApiToken } from './raid-helper.consts.js';

export const InjectRaidHelperApi = () => Inject(getRaidHelperApiToken());
