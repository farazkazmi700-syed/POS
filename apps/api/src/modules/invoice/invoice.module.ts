import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../order/schemas/order.schema';
import { TenantModule } from '../tenant/tenant.module';
import { INVOICE_QUEUE } from './invoice.constants';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: INVOICE_QUEUE }),
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    TenantModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
