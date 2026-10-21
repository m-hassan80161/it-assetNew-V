import { Module } from "@nestjs/common";
import { AgentAdminController } from "./agent-admin.controller";
import { AgentController } from "./agent.controller";
import { AgentAuthGuard } from "./agent-auth.guard";
import { AgentsService } from "./agents.service";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [InventoryModule],
  controllers: [AgentAdminController, AgentController],
  providers: [AgentsService, AgentAuthGuard],
})
export class AgentsModule {}
