import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Tenant, TenantSchema } from '../tenant/schemas/tenant.schema';
import { AdminAudit, AdminAuditSchema } from './schemas/admin-audit.schema';
import { PlatformModule, PlatformModuleSchema } from './schemas/platform-module.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from './schemas/subscription-plan.schema';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { ModuleRegistryService } from './module-registry.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: Tenant.name, schema: TenantSchema },
    { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    { name: AdminAudit.name, schema: AdminAuditSchema },
    { name: PlatformModule.name, schema: PlatformModuleSchema },
  ])],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, ModuleRegistryService],
  exports: [SuperAdminService, ModuleRegistryService],
})
export class SuperAdminModule {}
