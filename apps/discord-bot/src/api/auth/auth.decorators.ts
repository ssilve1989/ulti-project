import {
  type ExecutionContext,
  Inject,
  createParamDecorator,
} from '@nestjs/common';

export const BETTER_AUTH_INSTANCE_TOKEN = '@better-auth/token';
export const InjectBetterAuth = () => Inject(BETTER_AUTH_INSTANCE_TOKEN);

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
