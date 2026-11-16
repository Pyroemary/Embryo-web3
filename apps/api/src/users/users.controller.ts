import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { User } from "@prisma/client";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { zodiacFromDate, ZODIAC } from "@embryo/roundup";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma.service";
import { CountryPolicyService } from "../compliance/country-policy.service";

const profileSchema = z.object({
  dateOfBirth: z.string().date().optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  locale: z.enum(["en", "ar"]).optional(),
  walletAddress: z.string().refine((v) => isAddress(v), "invalid address").optional(),
  track: z.enum(["CONVENTIONAL", "SHARIA"]).optional(),
  riskProfile: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).optional(),
  email: z.string().email().optional(),
});
type ProfileInput = z.infer<typeof profileSchema>;

@Controller("me")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CountryPolicyService,
  ) {}

  @Get()
  async me(@CurrentUser() user: User) {
    return {
      ...user,
      zodiac: user.zodiacSign ? ZODIAC[user.zodiacSign as keyof typeof ZODIAC] : null,
      eligibility: await this.policy.eligibility(user.countryCode),
    };
  }

  @Patch()
  async update(@CurrentUser() user: User, @Body(new ZodPipe(profileSchema)) input: ProfileInput) {
    const data: Record<string, unknown> = { ...input };
    if (input.dateOfBirth) {
      const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) throw new BadRequestException("Must be 18 or older");
      data.dateOfBirth = dob;
      data.zodiacSign = zodiacFromDate(dob);
    }
    if (input.countryCode && user.kycStatus === "APPROVED" && input.countryCode !== user.countryCode) {
      throw new BadRequestException("Country cannot change after KYC approval; contact support");
    }
    if (input.walletAddress) {
      // TODO(prod): verify the address is the user's Privy embedded wallet via Privy server API.
      if (user.walletAddress && user.walletAddress !== input.walletAddress.toLowerCase()) {
        throw new BadRequestException("Wallet already linked");
      }
      data.walletAddress = getAddress(input.walletAddress).toLowerCase();
    }
    return this.prisma.user.update({ where: { id: user.id }, data });
  }

  @Get("eligibility")
  eligibility(@CurrentUser() user: User) {
    return this.policy.eligibility(user.countryCode);
  }
}
