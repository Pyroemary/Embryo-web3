import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const cfg = config(); // fail fast on bad / unsafe config
  const app = await NestFactory.create(AppModule, { rawBody: true }); // raw body for webhook HMACs
  app.enableShutdownHooks();
  app.enableCors({ origin: false });
  await app.listen(cfg.PORT);
  Logger.log(`embryo-api listening on :${cfg.PORT} (${cfg.NODE_ENV}, chain dry-run=${cfg.CHAIN_DRY_RUN})`);
}

bootstrap();
