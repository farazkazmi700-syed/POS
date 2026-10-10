import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InvoiceStatus, OrderStatus, PaymentMode } from '../../../common/enums';

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true }) productId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) qty: number;
  @Prop({ required: true }) unitPrice: number;
  @Prop({ default: 0 }) discountPercent: number;
  @Prop({ default: 0 }) discountAmount: number;
  @Prop({ default: 0 }) taxPercent: number;
  @Prop({ default: 0 }) taxAmount: number;
  @Prop({ required: true }) lineTotal: number;
  /** IMEI / serial number(s) recorded at the sale (warranty, recovery) */
  @Prop() serialNo?: string;
  /** remembered so a void knows whether stock must be restored */
  @Prop({ default: true }) stockTracked: boolean;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
class ChargeAmount {
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) amount: number;
}
const ChargeAmountSchema = SchemaFactory.createForClass(ChargeAmount);

@Schema({ _id: false })
class TaxBreakdownRow {
  @Prop({ required: true }) ratePercent: number;
  @Prop({ required: true }) taxableAmount: number;
  @Prop({ required: true }) taxAmount: number;
}
const TaxBreakdownRowSchema = SchemaFactory.createForClass(TaxBreakdownRow);

@Schema({ _id: false })
class Customer {
  @Prop() name?: string;
  @Prop() phone?: string;
}
const CustomerSchema = SchemaFactory.createForClass(Customer);

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) cashierId: Types.ObjectId;
  @Prop({ required: true }) cashierName: string;
  @Prop({ required: true }) invoiceNo: string;
  @Prop({ type: [OrderItemSchema], required: true }) items: OrderItem[];
  @Prop({ required: true }) subtotal: number;
  @Prop({ required: true }) discountTotal: number;
  @Prop({ required: true }) taxableTotal: number;
  @Prop({ required: true }) taxTotal: number;
  @Prop({ type: [ChargeAmountSchema], default: [] }) charges: ChargeAmount[];
  @Prop({ default: 0 }) chargesTotal: number;
  @Prop({ required: true }) grandTotal: number;
  @Prop({ type: [TaxBreakdownRowSchema], default: [] }) taxBreakdown: TaxBreakdownRow[];
  @Prop({ required: true, enum: PaymentMode }) paymentMode: PaymentMode;
  @Prop({ type: CustomerSchema }) customer?: Customer;
  @Prop() note?: string;
  @Prop({ enum: OrderStatus, default: OrderStatus.Completed }) status: OrderStatus;
  @Prop() voidedAt?: Date;
  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.Pending }) invoiceStatus: InvoiceStatus;
  /** path relative to STORAGE_DIR, written by the pdf-worker */
  @Prop() invoicePdfPath?: string;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ tenantId: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
