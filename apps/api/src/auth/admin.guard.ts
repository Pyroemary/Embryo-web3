import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { config } from "../config";
import { safeEqual } from "../common/hmac";

/** v1 admin auth: static API key from the admin console's server side. Replace with SSO + RBAC. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const key = ctx.switchToHttp().getRequest().headers["x-admin-key"];
    const expected = config().ADMIN_API_KEY;
    if (!expected || typeof key !== "string" || !safeEqual(key, expected)) throw new UnauthorizedException();
    return true;
  }
}
