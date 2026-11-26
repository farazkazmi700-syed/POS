import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { AppearanceService } from './appearance.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }])],
  controllers: [TenantController],
  providers: [TenantService, AppearanceService],
  exports: [TenantService],
})
export class TenantModule {}
