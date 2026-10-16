import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Tenant, TenantSchema } from '../tenant/schemas/tenant.schema';
import { AdminAudit, AdminAuditSchema } from './schemas/admin-audit.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from './schemas/subscription-plan.schema';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: Tenant.name, schema: TenantSchema },
    { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    { name: AdminAudit.name, schema: AdminAuditSchema },
  ])],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}