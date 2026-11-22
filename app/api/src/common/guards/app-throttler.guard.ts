import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.THROTTLE_ENABLED === 'false' || process.env.NODE_ENV === 'test') {
      return true;
    }
    return super.shouldSkip(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If authenticated, track per user so multiple cashiers/devices on the same IP or localhost do not collide
    if (req.user?.userId) {
      return `user_${req.user.userId}`;
    }
    return req.ips?.length ? req.ips[0] : (req.ip || '127.0.0.1');
  }

  protected async getErrorMessage(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'Too many requests. Please slow down and try again shortly.';
  }
}

