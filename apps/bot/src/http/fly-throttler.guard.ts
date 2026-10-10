import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** Rate-limits each client by the IP Fly's proxy saw it connect from. */
@Injectable()
export class FlyThrottlerGuard extends ThrottlerGuard {
  // Behind Fly's proxy every request comes from the proxy's IP; Fly-Client-IP is the client's.
  // The base guard groups IPv6 addresses by /64, so one client can't dodge the limit by rotating.
  protected override getTracker(req: Request): Promise<string> {
    return super.getTracker({ ip: req.get('fly-client-ip') ?? req.ip });
  }
}
