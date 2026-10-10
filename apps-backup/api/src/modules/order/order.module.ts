import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceModule } from '../invoice/invoice.module';
import { ProductModule } from '../product/product.module';
import { TenantModule } from '../tenant/tenant.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { InvoiceCounter, InvoiceCounterSchema } from './schemas/invoice-counter.schema';
import { Order, OrderSchema } from './schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
    ]),
    ProductModule, TenantModule, InvoiceModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
