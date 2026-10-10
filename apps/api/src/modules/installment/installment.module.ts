import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerModule } from '../customer/customer.module';
import { InstallmentController } from './installment.controller';
import { InstallmentService } from './installment.service';
import { InstallmentPlan, InstallmentPlanSchema } from './schemas/installment-plan.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: InstallmentPlan.name, schema: InstallmentPlanSchema }]), CustomerModule],
  controllers: [InstallmentController],
  providers: [InstallmentService],
  exports: [InstallmentService],
})
export class InstallmentModule {}
