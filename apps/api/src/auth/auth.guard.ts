import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { User } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { TOKEN_VERIFIER, TokenVerifier } from "./token-verifier";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const verified = await this.verifier.verify(req.headers["authorization"]);
    if (!verified) throw new UnauthorizedException();
    req.user = await this.prisma.user.upsert({
      where: { authSubject: verified.subject },
      create: { authSubject: verified.subject },
      update: {},
    });
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest().user;
});
