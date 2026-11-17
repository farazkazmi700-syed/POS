# MongoDB source inventory

Generated from the current working tree on 2026-11-15. These are source declarations, not assertions that all corresponding collections exist in live data.

Includes schemas embedded in module/service files. Branch fields are also injected by `common/branch-scope.ts`.

## apps/api/src/modules/customer/schemas/customer.schema.ts

```text
5:@Schema({ _id: false })
6:export class Guarantor {
7:  @Prop() name?: string;
8:  @Prop() phone?: string;
9:  @Prop() cnic?: string;
10:  @Prop() address?: string;
14:@Schema({ timestamps: true })
15:export class Customer {
16:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
17:  @Prop({ required: true, trim: true }) name: string;
18:  @Prop({ required: true, trim: true }) phone: string;
20:  @Prop({ trim: true }) cnic?: string;
21:  @Prop() address?: string;
22:  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;
23:  @Prop() notes?: string;
28:CustomerSchema.plugin(branchScoped);
29:CustomerSchema.index({ tenantId: 1, name: 1 });
30:CustomerSchema.index({ tenantId: 1, phone: 1 });
```

## apps/api/src/modules/auth/schemas/user.schema.ts

```text
5:@Schema({ timestamps: true })
6:export class User {
7:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
8:  @Prop({ required: true, trim: true }) name: string;
9:  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
10:  @Prop({ type: String, default: null, trim: true, index: true }) phone: string | null;
11:  @Prop({ type: String, default: null, lowercase: true, trim: true }) recoveryEmail: string | null;
12:  @Prop({ default: false }) emailVerified: boolean;
13:  @Prop({ type: Date, default: null }) emailVerifiedAt: Date | null;
14:  @Prop({ type: String, select: false }) emailVerificationCodeHash?: string;
15:  @Prop({ type: Date, select: false }) emailVerificationExpiresAt?: Date;
16:  @Prop({ default: 0, select: false }) emailVerificationAttempts: number;
17:  @Prop({ default: false }) phoneVerified: boolean;
18:  @Prop({ type: Date, default: null }) phoneVerifiedAt: Date | null;
19:  @Prop({ type: Date, select: false }) securityCodeRequestedAt?: Date;
20:  @Prop({ default: false }) pinEnabled: boolean;
21:  @Prop({ required: true, select: false }) passwordHash: string;
23:  @Prop({ default: 0, select: false }) developerSessionVersion: number;
24:  @Prop({ type: String, select: false }) pinHash?: string;
25:  @Prop({ type: String, select: false }) developerPinHash?: string;
26:  @Prop({ default: 0 }) sessionVersion: number;
27:  @Prop({ default: false }) pinRequiresChange: boolean;
28:  @Prop({ default: 0 }) pinVersion: number;
29:  @Prop({ default: 0, select: false }) pinFailedAttempts: number;
30:  @Prop({ type: Date, default: null, select: false }) pinLockedUntil: Date | null;
31:  @Prop({ type: String, select: false }) pinChallengeId?: string;
32:  @Prop({ type: String, select: false }) pinResetCodeHash?: string;
33:  @Prop({ type: Date, select: false }) pinResetExpiresAt?: Date;
34:  @Prop({ default: 0, select: false }) pinResetAttempts: number;
35:  @Prop({ required: true, enum: Role }) role: Role;
37:  @Prop({ type: [String], default: undefined }) moduleRights?: string[];
38:  @Prop({ type: [String], default: undefined }) permissions?: string[];
39:  @Prop({ type: [Types.ObjectId], default: [] }) branchIds: Types.ObjectId[];
40:  @Prop({ default: false }) superAdmin: boolean;
41:  @Prop({ default: true }) isActive: boolean;
43:  @Prop({ type: Date, default: null, select: false }) enrollmentExpiresAt?: Date | null;
44:  @Prop({ default: false }) passwordRequiresChange: boolean;
62:UserSchema.index({ superAdmin: 1 }, {
63:  unique: true,
64:  partialFilterExpression: { superAdmin: true },
```

## apps/api/src/modules/audit/audit.module.ts

```text
10:@Schema({ timestamps: { createdAt: true, updatedAt: false } })
11:export class AuditEvent {
12:  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
13:  @Prop({ required: true }) actorId: string;
14:  @Prop({ required: true }) action: string;
15:  @Prop({ required: true }) resource: string;
16:  @Prop({ type: Types.ObjectId }) branchId?: Types.ObjectId;
17:  @Prop({ type: Object }) details?: Record<string, unknown>;
20:schema.index({ tenantId: 1, createdAt: -1 });
24:export class AuditService {
39:class AuditInterceptor implements NestInterceptor {
53:class AuditController {
59:export class AuditModule {}
```

## apps/api/src/modules/tenant/schemas/tenant.schema.ts

```text
5:@Schema({ _id: false })
6:export class ChargeRule {
7:  @Prop({ required: true }) label: string;
8:  @Prop({ required: true, enum: ChargeType }) type: ChargeType;
9:  @Prop({ required: true, min: 0 }) value: number;
18:@Schema({ _id: false })
19:export class TaxProfile {
20:  @Prop({ default: 18, min: 0, max: 100 }) gstPercent: number;
21:  @Prop({ default: 5, min: 0, max: 100 }) reducedGstPercent: number;
22:  @Prop({ default: 0, min: 0, max: 100 }) serviceChargePercent: number;
23:  @Prop({ type: [ChargeRuleSchema], default: [] }) otherCharges: ChargeRule[];
27:@Schema({ _id: false })
28:export class NavigationVisibility {
29:  @Prop({ default: true }) dashboard: boolean;
30:  @Prop({ default: true }) pos: boolean;
31:  @Prop({ default: true }) products: boolean;
32:  @Prop({ default: true }) customers: boolean;
33:  @Prop({ default: true }) installments: boolean;
34:  @Prop({ default: true }) barcodeGenerator: boolean;
35:  @Prop({ default: true }) barcodeScanner: boolean;
36:  @Prop({ default: true }) orders: boolean;
37:  @Prop({ default: true }) settings: boolean;
41:@Schema({ _id: false })
42:export class TenantFeatureFlags {
43:  @Prop({ default: true }) pos: boolean;
44:  @Prop({ default: true }) inventory: boolean;
45:  @Prop({ default: true }) reports: boolean;
46:  @Prop({ default: true }) customers: boolean;
47:  @Prop({ default: true }) installments: boolean;
48:  @Prop({ default: true }) barcodes: boolean;
52:@Schema({ timestamps: true })
53:export class Tenant {
54:  @Prop({ type: Types.ObjectId, default: null }) defaultBranchId?: Types.ObjectId | null;
55:  @Prop({ default: 1, min: 1 }) branchLimit: number;
56:  @Prop({ default: 0, min: 0 }) branchCount: number;
57:  @Prop({ enum: ['cloud', 'offline', 'hybrid'], default: 'cloud' }) deploymentMode: 'cloud' | 'offline' | 'hybrid';
58:  @Prop({ type: Date, default: null }) licenseExpiresAt?: Date | null;
59:  @Prop({ default: 'Asia/Karachi' }) timeZone: string;
60:  @Prop({ required: true, trim: true }) name: string;
61:  @Prop({ required: true, enum: DomainType, default: DomainType.Retail }) domainType: DomainType;
62:  @Prop() logoUrl?: string;
63:  @Prop() address?: string;
64:  @Prop() taxRegNo?: string;
65:  @Prop({ default: 'PKR' }) currency: string;
66:  @Prop({ default: 'INV' }) invoicePrefix: string;
67:  @Prop({ type: TaxProfileSchema, default: () => ({}) }) taxProfile: TaxProfile;
69:  @Prop({ default: 0, min: 0, max: 100 }) installmentMarkupPercent: number;
70:  @Prop({ type: NavigationVisibilitySchema, default: () => ({}) }) navigationVisibility: NavigationVisibility;
71:  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active', index: true }) status: 'active' | 'suspended';
72:  @Prop({ type: TenantFeatureFlagsSchema, default: () => ({}) }) featureFlags: TenantFeatureFlags;
73:  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null }) subscriptionPlanId: Types.ObjectId | null;
```

## apps/api/src/modules/auth/recovery.service.ts

```text
12:@Schema()
13:export class RecoveryChallenge {
14:  @Prop({ required: true, unique: true }) challengeId: string;
15:  @Prop({ required: true, type: Types.ObjectId }) userId: Types.ObjectId;
16:  @Prop({ required: true }) purpose: string;
17:  @Prop({ required: true }) channel: string;
18:  @Prop({ required: true }) destination: string;
19:  @Prop({ required: true, select: false }) codeHash: string;
20:  @Prop({ required: true, expires: 0 }) expiresAt: Date;
21:  @Prop({ default: 0 }) attempts: number;
22:  @Prop({ required: true }) sessionVersion: number;
23:  @Prop({ required: true }) developerSessionVersion: number;
28:export class RecoveryService {
```

## apps/api/src/modules/branch/branch.module.ts

```text
17:@Schema({ timestamps: true }) export class Branch {
18:  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
19:  @Prop({ required: true }) name: string;
20:  @Prop({ required: true }) code: string;
21:  @Prop() address?: string;
22:  @Prop({ default: true }) isActive: boolean;
25:schema.index({ tenantId: 1, code: 1 }, { unique: true });
26:class CreateBranchDto { @IsString() @Length(2, 100) name: string; @IsString() @Length(2, 20) code: string; @IsOptional() @IsString() @MaxLength(300) address?: string; }
27:class UpdateBranchDto { @IsOptional() @IsString() @Length(2, 100) name?: string; @IsOptional() @IsBoolean() isActive?: boolean; }
29:@Injectable() export class BranchService {
52:@Injectable() class BranchContextInterceptor implements NestInterceptor {
61:class BranchController {
69:export class BranchModule {}
```

## apps/api/src/modules/order/schemas/order.schema.ts

```text
6:@Schema({ _id: false })
7:export class OrderItem {
8:  @Prop({ type: Types.ObjectId, ref: 'Product', required: true }) productId: Types.ObjectId;
9:  @Prop({ required: true }) name: string;
10:  @Prop({ required: true }) qty: number;
11:  @Prop({ required: true }) unitPrice: number;
12:  @Prop({ default: 0 }) discountPercent: number;
13:  @Prop({ default: 0 }) discountAmount: number;
14:  @Prop({ default: 0 }) taxPercent: number;
15:  @Prop({ default: 0 }) taxAmount: number;
16:  @Prop({ required: true }) lineTotal: number;
18:  @Prop() serialNo?: string;
20:  @Prop({ default: true }) stockTracked: boolean;
24:@Schema({ _id: false })
25:class ChargeAmount {
26:  @Prop({ required: true }) label: string;
27:  @Prop({ required: true }) amount: number;
31:@Schema({ _id: false })
32:class TaxBreakdownRow {
33:  @Prop({ required: true }) ratePercent: number;
34:  @Prop({ required: true }) taxableAmount: number;
35:  @Prop({ required: true }) taxAmount: number;
39:@Schema({ _id: false })
40:class Customer {
41:  @Prop() name?: string;
42:  @Prop() phone?: string;
46:@Schema({ timestamps: true })
47:export class Order {
48:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
49:  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) cashierId: Types.ObjectId;
50:  @Prop({ required: true }) cashierName: string;
51:  @Prop({ required: true }) invoiceNo: string;
52:  @Prop() idempotencyKey?: string;
53:  @Prop({ type: [{ _id: false, mode: String, amount: Number }], default: undefined }) payments?: { mode: string; amount: number }[];
54:  @Prop({ type: Object }) refund?: { reason: string; amount: number; approvedBy: string; refundedAt: Date };
55:  @Prop({ type: [OrderItemSchema], required: true }) items: OrderItem[];
56:  @Prop({ required: true }) subtotal: number;
57:  @Prop({ required: true }) discountTotal: number;
58:  @Prop({ required: true }) taxableTotal: number;
59:  @Prop({ required: true }) taxTotal: number;
60:  @Prop({ type: [ChargeAmountSchema], default: [] }) charges: ChargeAmount[];
61:  @Prop({ default: 0 }) chargesTotal: number;
62:  @Prop({ required: true }) grandTotal: number;
63:  @Prop({ type: [TaxBreakdownRowSchema], default: [] }) taxBreakdown: TaxBreakdownRow[];
64:  @Prop({ required: true, enum: PaymentMode }) paymentMode: PaymentMode;
65:  @Prop({ type: CustomerSchema }) customer?: Customer;
66:  @Prop() note?: string;
67:  @Prop({ enum: OrderStatus, default: OrderStatus.Completed }) status: OrderStatus;
68:  @Prop() voidedAt?: Date;
69:  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.Pending }) invoiceStatus: InvoiceStatus;
71:  @Prop() invoicePdfPath?: string;
76:OrderSchema.plugin(branchScoped);
77:OrderSchema.index({ tenantId: 1, createdAt: -1 });
78:OrderSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
79:OrderSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
```

## apps/api/src/modules/stock/stock.module.ts

```text
15:@Schema({ timestamps: true }) class StockAdjustment {
16:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
17:  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
18:  @Prop({ required: true }) idempotencyKey: string;
19:  @Prop({ required: true }) delta: number;
20:  @Prop({ required: true }) reason: string;
21:  @Prop({ required: true }) actorId: string;
22:  @Prop({ default: 'pending', enum: ['pending', 'applied', 'rejected'] }) status: string;
24:const schema = SchemaFactory.createForClass(StockAdjustment); schema.plugin(branchScoped); schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
25:class AdjustStockDto { @IsMongoId() productId: string; @IsUUID() idempotencyKey: string; @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }) delta: number; @IsString() @Length(3, 300) reason: string; }
26:@Injectable() class StockService {
53:class StockController {
58:@Module({ imports: [ProductModule, MongooseModule.forFeature([{ name: StockAdjustment.name, schema }])], providers: [StockService], controllers: [StockController] }) export class StockModule {}
```

## apps/api/src/modules/order/schemas/invoice-counter.schema.ts

```text
5:@Schema()
6:export class InvoiceCounter {
7:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
8:  @Prop({ required: true }) year: number;
9:  @Prop({ default: 0 }) lastNumber: number;
13:InvoiceCounterSchema.index({ tenantId: 1, year: 1 }, { unique: true });
```

## apps/api/src/modules/order/schemas/checkout-request.schema.ts

```text
4:@Schema({ timestamps: true })
5:export class CheckoutRequest {
6:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
7:  @Prop({ required: true }) key: string;
8:  @Prop({ required: true }) hash: string;
9:  @Prop({ type: Object }) result?: Record<string, unknown>;
12:CheckoutRequestSchema.plugin(branchScoped);
13:CheckoutRequestSchema.index({ tenantId: 1, key: 1 }, { unique: true });
```

## apps/api/src/modules/super-admin/schemas/subscription-plan.schema.ts

```text
4:@Schema({ _id: false })
5:export class PlanFeatures {
6:  @Prop({ required: true, default: false }) barcodes: boolean;
7:  @Prop({ required: true, default: true }) pos: boolean;
8:  @Prop({ required: true, default: true }) inventory: boolean;
9:  @Prop({ required: true, default: true }) reports: boolean;
10:  @Prop({ required: true, default: true }) customers: boolean;
11:  @Prop({ required: true, default: true }) installments: boolean;
15:@Schema({ timestamps: true })
16:export class SubscriptionPlan {
17:  @Prop({ required: true, unique: true, trim: true }) name: string;
18:  @Prop({ type: String, default: '' }) description: string;
19:  @Prop({ required: true, min: 0 }) price: number;
20:  @Prop({ required: true, enum: ['monthly', 'yearly', 'lifetime'], default: 'monthly' }) billingInterval: 'monthly' | 'yearly' | 'lifetime';
21:  @Prop({ type: PlanFeaturesSchema, default: () => ({}) }) features: PlanFeatures;
22:  @Prop({ default: true, index: true }) isActive: boolean;
```

## apps/api/src/modules/super-admin/schemas/platform-module.schema.ts

```text
5:@Schema({ timestamps: true })
6:export class PlatformModule {
8:  @Prop({ required: true, unique: true, trim: true, lowercase: true })
11:  @Prop({ required: true, trim: true }) label: string;
12:  @Prop({ type: String, default: '' }) description: string;
13:  @Prop({ default: true, index: true }) isActive: boolean;
```

## apps/api/src/modules/super-admin/schemas/admin-audit.schema.ts

```text
4:@Schema({ timestamps: true })
5:export class AdminAudit {
6:  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) actorId: Types.ObjectId;
7:  @Prop({ required: true, trim: true }) actorEmail: string;
8:  @Prop({ required: true, trim: true, index: true }) action: string;
9:  @Prop({ required: true, trim: true, index: true }) entityType: string;
10:  @Prop({ required: true, trim: true, index: true }) entityId: string;
11:  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) details: Record<string, unknown>;
17:AdminAuditSchema.index({ createdAt: -1 });
```

## apps/api/src/modules/product/schemas/product.schema.ts

```text
6:@Schema({ timestamps: true })
7:export class Product {
8:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
9:  @Prop({ required: true, trim: true }) name: string;
10:  @Prop({ trim: true }) sku?: string;
11:  @Prop({ trim: true }) category?: string;
12:  @Prop({ default: 'pcs' }) unit: string;
13:  @Prop({ required: true, min: 0 }) price: number;
14:  @Prop({ default: 0, min: 0 }) costPrice: number;
15:  @Prop({ default: 0, min: 0 }) stockQty: number;
16:  @Prop({ default: 5, min: 0 }) lowStockThreshold: number;
18:  @Prop({ default: true }) trackStock: boolean;
19:  @Prop({ required: true, enum: TaxClass, default: TaxClass.Standard }) taxClass: TaxClass;
21:  @Prop({ type: Object, default: {} }) attributes: Record<string, string | number | boolean>;
22:  @Prop() imageUrl?: string;
23:  @Prop({ default: true }) isActive: boolean;
24:  @Prop({ type: [String], default: [], select: false }) restoredSaleEvents: string[];
25:  @Prop({ type: [String], default: [], select: false }) stockAdjustmentEvents: string[];
26:  @Prop() barcode?: string;
31:ProductSchema.plugin(branchScoped);
34:ProductSchema.index(
36:  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
38:ProductSchema.index({ tenantId: 1, name: 1 });
39:ProductSchema.index({ tenantId: 1, branchId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });
```

## apps/api/src/modules/installment/schemas/installment-sale.schema.ts

```text
8:@Schema({ _id: false })
9:export class InstallmentScheduleEntry {
10:  @Prop({ required: true }) installmentId: string;
11:  @Prop({ required: true }) dueDate: string;
12:  @Prop({ required: true, min: 0 }) expectedAmount: number;
13:  @Prop({ default: 0, min: 0 }) amountPaid: number;
14:  @Prop({ default: 0, min: 0 }) remainingAmount: number;
15:  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'] }) status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
18:@Schema({ _id: false })
19:export class InstallmentPaymentEntry {
20:  @Prop({ required: true }) paymentId: string;
21:  @Prop({ required: true }) installmentId?: string;
22:  @Prop({ required: true, min: 0 }) amount: number;
23:  @Prop({ required: true }) paidAt: Date;
24:  @Prop({ required: true, enum: ['cash', 'card', 'wallet'] }) mode: 'cash' | 'card' | 'wallet';
25:  @Prop() note?: string;
26:  @Prop() receiptNo?: string;
32:@Schema({ timestamps: true })
33:export class InstallmentSale {
34:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
35:  @Prop({ required: true, unique: true, index: true }) installmentSaleId: string;
36:  @Prop({ required: true }) agreementId: string;
37:  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
38:  @Prop({ type: Types.ObjectId, ref: 'InstallmentProduct', required: true, index: true }) installmentProductId: Types.ObjectId;
39:  @Prop({ required: true }) saleDate: string;
40:  @Prop({ required: true, min: 0 }) actualPrice: number;
41:  @Prop({ required: true, min: 0 }) advancePayment: number;
42:  @Prop({ required: true, min: 0, max: 100 }) commissionRate: number;
43:  @Prop({ required: true, min: 0 }) commissionAmount: number;
44:  @Prop({ required: true, min: 0 }) totalInstallmentPrice: number;
45:  @Prop({ required: true, min: 1, max: 120 }) installmentDuration: number;
46:  @Prop({ required: true, enum: ['monthly', 'weekly', 'biweekly'], default: 'monthly' }) paymentFrequency: InstallmentPaymentFrequency;
47:  @Prop({ required: true, min: 0 }) outstandingBalance: number;
48:  @Prop({ default: 0, min: 0 }) totalPaid: number;
49:  @Prop({ default: 'pending', enum: ['pending', 'active', 'completed', 'overdue', 'cancelled'] }) saleStatus: InstallmentSaleStatus;
50:  @Prop({ type: [InstallmentScheduleEntrySchema], default: [] }) schedule: InstallmentScheduleEntry[];
51:  @Prop({ type: [InstallmentPaymentEntrySchema], default: [] }) payments: InstallmentPaymentEntry[];
52:  @Prop({ default: true }) isActive: boolean;
53:  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
58:InstallmentSaleSchema.plugin(branchScoped);
59:InstallmentSaleSchema.index({ tenantId: 1, customerId: 1, saleStatus: 1 });
60:InstallmentSaleSchema.index({ tenantId: 1, installmentProductId: 1 });
```

## apps/api/src/modules/installment/schemas/installment-plan.schema.ts

```text
7:@Schema({ _id: false })
8:export class PlanItem {
9:  @Prop({ required: true }) name: string;
10:  @Prop({ required: true }) qty: number;
11:  @Prop() serialNo?: string;
12:  @Prop() unitPrice?: number;
13:  @Prop() discountAmount?: number;
14:  @Prop() taxAmount?: number;
15:  @Prop() lineTotal?: number;
20:@Schema({ _id: false })
21:export class ScheduleEntry {
22:  @Prop({ required: true }) no: number;
24:  @Prop({ required: true }) dueDate: string;
25:  @Prop({ required: true }) amount: number;
26:  @Prop({ default: 0 }) paidAmount: number;
27:  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid'] }) status: 'pending' | 'partial' | 'paid';
31:@Schema({ _id: false })
32:export class PlanPayment {
33:  @Prop({ required: true }) receiptNo: string;
34:  @Prop() idempotencyKey?: string;
35:  @Prop({ required: true }) amount: number;
36:  @Prop({ required: true }) paidAt: Date;
37:  @Prop({ required: true, enum: [PaymentMode.Cash, PaymentMode.Card, PaymentMode.Wallet] }) mode: PaymentMode;
38:  @Prop({ required: true }) receivedBy: string;
39:  @Prop() note?: string;
43:@Schema({ timestamps: true })
44:export class InstallmentPlan {
45:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
46:  @Prop({ type: Types.ObjectId, ref: 'Order', required: true }) orderId: Types.ObjectId;
47:  @Prop({ required: true }) invoiceNo: string;
50:  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
51:  @Prop({ required: true }) customerName: string;
52:  @Prop({ required: true }) customerPhone: string;
53:  @Prop() customerCnic?: string;
54:  @Prop() customerAddress?: string;
55:  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;
57:  @Prop({ type: [PlanItemSchema], default: [] }) items: PlanItem[];
59:  @Prop({ required: true }) cashTotal: number;
60:  @Prop({ required: true }) downPayment: number;
61:  @Prop({ required: true }) markupPercent: number;
62:  @Prop({ required: true }) markupAmount: number;
63:  @Prop({ required: true }) totalPayable: number;
64:  @Prop({ required: true }) financedAmount: number;
65:  @Prop({ required: true }) months: number;
66:  @Prop({ required: true }) monthlyAmount: number;
67:  @Prop({ required: true }) firstDueDate: string;
69:  @Prop({ type: [ScheduleEntrySchema], default: [] }) schedule: ScheduleEntry[];
70:  @Prop({ type: [PlanPaymentSchema], default: [] }) payments: PlanPayment[];
71:  @Prop({ default: 0 }) paidTotal: number;
72:  @Prop({ required: true }) balance: number;
73:  @Prop({ enum: PlanStatus, default: PlanStatus.Active }) status: PlanStatus;
74:  @Prop({ required: true }) createdByName: string;
79:InstallmentPlanSchema.plugin(branchScoped);
80:InstallmentPlanSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
81:InstallmentPlanSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });
```

## apps/api/src/modules/installment/schemas/installment-product.schema.ts

```text
7:@Schema({ timestamps: true })
8:export class InstallmentProduct {
9:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
10:  @Prop({ required: true, unique: true, index: true }) installmentProductId: string;
11:  @Prop({ required: true, trim: true }) name: string;
12:  @Prop({ trim: true }) brand?: string;
13:  @Prop({ trim: true }) model?: string;
14:  @Prop({ trim: true }) category?: string;
15:  @Prop({ trim: true }) description?: string;
16:  @Prop({ trim: true }) imageUrl?: string;
17:  @Prop({ default: 0, min: 0 }) actualPrice: number;
18:  @Prop({ default: 0, min: 0, max: 100 }) defaultCommissionRate: number;
19:  @Prop({ default: 'active', enum: ['active', 'inactive', 'archived'] }) status: InstallmentProductStatus;
20:  @Prop({ default: true }) isActive: boolean;
21:  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
26:InstallmentProductSchema.plugin(branchScoped);
27:InstallmentProductSchema.index({ tenantId: 1, name: 1 });
28:InstallmentProductSchema.index({ tenantId: 1, status: 1 });
```

Raw recovery collections are accessed from `auth/password-recovery.service.ts`: `password_reset_tokens` and `recovery_codes`. Worker collection access is in `apps/pdf-worker/src/worker.ts`. No GridFS, change-stream or MongoDB session transaction calls were found in the source scan; this is not a claim about external clients.
