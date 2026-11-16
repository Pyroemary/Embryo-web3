import { Controller, Get, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AdminController } from "./admin/admin.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AdminGuard } from "./auth/admin.guard";
import { PrivyTokenVerifier, TOKEN_VERIFIER } from "./auth/token-verifier";
import { CardsController } from "./cards/cards.controller";
import { CARD_ISSUER, MockCardIssuer, RainCardIssuer } from "./cards/card-issuer";
import { ChainService } from "./chain/chain.service";
import { BigIntInterceptor } from "./common/bigint.interceptor";
import { CountryPolicyService } from "./compliance/country-policy.service";
import { GateSyncService } from "./compliance/gate-sync.service";
import { KycController } from "./compliance/kyc.controller";
import { SumsubClient } from "./compliance/sumsub.client";
import { config } from "./config";
import { FxService } from "./fx/fx.service";
import { LedgerService } from "./ledger/ledger.service";
import { PrismaService } from "./prisma.service";
import { RoundUpsController } from "./roundups/roundups.controller";
import { RoundUpsService } from "./roundups/roundups.service";
import { SettlementService } from "./roundups/settlement.service";
import { UsersController } from "./users/users.controller";

@Controller("health")
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "embryo-api" };
  }
}

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [HealthController, UsersController, KycController, CardsController, RoundUpsController, AdminController],
  providers: [
    PrismaService,
    AuthGuard,
    AdminGuard,
    CountryPolicyService,
    SumsubClient,
    GateSyncService,
    ChainService,
    FxService,
    LedgerService,
    RoundUpsService,
    SettlementService,
    { provide: APP_INTERCEPTOR, useClass: BigIntInterceptor },
    {
      provide: TOKEN_VERIFIER,
      useFactory: () => {
        const c = config();
        return new PrivyTokenVerifier(c.PRIVY_APP_ID, c.AUTH_DEV_BYPASS && c.NODE_ENV !== "production");
      },
    },
    {
      provide: CARD_ISSUER,
      useFactory: () => (config().CARD_ISSUER === "rain" ? new RainCardIssuer() : new MockCardIssuer()),
    },
  ],
})
export class AppModule {}
