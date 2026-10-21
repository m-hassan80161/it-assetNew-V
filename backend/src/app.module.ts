import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ActiveDirectoryModule } from "./modules/active-directory/ad.module";
//import { FileServerModule } from "./modules/file-server/file-server.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { LogsModule } from "./modules/logs/logs.module";
import { AgentsModule } from "./modules/agents/agents.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    InventoryModule,
    ActiveDirectoryModule,
   // FileServerModule,
    OnboardingModule, // depends on AD + FileServer + SoftwareCompliance
    TicketsModule,
    LogsModule,
    AgentsModule,
  ],
})
export class AppModule {}
