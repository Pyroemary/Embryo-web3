import { Body, Controller, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import { User } from "@prisma/client";
import { z } from "zod";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma.service";
import { RoundUpsService, SettingsInput } from "./roundups.service";

const micro = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));

const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    spareChangeStep: z.union([z.literal(1), z.literal(5), z.literal(10), z.null()]).optional(),
    percentBps: z.number().int().min(0).max(5000).nullable().optional(),
    multiplier: z.number().int().min(1).max(10).optional(),
    dailyCapMicro: micro.optional(),
    recurringMicro: micro.nullable().optional(),
    recurringFreq: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  })
  .strict();

const oneTimeSchema = z.object({ amountMicro: micro });

@Controller("roundups")
@UseGuards(AuthGuard)
export class RoundUpsController {
  constructor(
    private readonly roundups: RoundUpsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("settings")
  settings(@CurrentUser() user: User) {
    return this.roundups.settings(user.id);
  }

  @Put("settings")
  update(@CurrentUser() user: User, @Body(new ZodPipe(settingsSchema)) input: SettingsInput) {
    return this.roundups.updateSettings(user, input);
  }

  @Get()
  list(@CurrentUser() user: User, @Query("limit") limit?: string) {
    return this.prisma.roundUpEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 50, 200),
      include: { transaction: { select: { merchantName: true, amountMinor: true, currency: true, occurredAt: true } } },
    });
  }

  @Get("summary")
  summary(@CurrentUser() user: User) {
    return this.roundups.summary(user.id);
  }

  @Post("one-time")
  oneTime(@CurrentUser() user: User, @Body(new ZodPipe(oneTimeSchema)) body: { amountMicro: bigint }) {
    return this.roundups.oneTime(user, body.amountMicro);
  }
}
