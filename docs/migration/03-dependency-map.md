# MongoDB dependency map

Source paths and line numbers from a repository-wide scan of application, shared-package, script and QA code. Generated output and installed dependencies are excluded. Existing services inject Mongoose models directly; raw-driver calls and ObjectId-dependent API validation also require migration.

```text
qa\api-integration.cjs:9:const mongoose = requireApi('mongoose');
qa\api-integration.cjs:15:const uri = `mongodb://127.0.0.1:27017/${databaseName}`;
qa\api-integration.cjs:31:  database = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
qa\api-integration.cjs:33:  const tenants = ['A', 'B'].map((name) => ({ _id: new mongoose.Types.ObjectId(), name: `Test ${name}`, currency: 'PKR', domainType: 'retail', status: 'active', branchLimit: 1, branchCount: 0, defaultBranchId: null, featureFlags: features, taxProfile: { gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] }, invoicePrefix: 'TEST' }));
qa\api-integration.cjs:34:  await database.collection('tenants').insertMany(tenants);
qa\api-integration.cjs:35:  const owners = await Promise.all(tenants.map(async (tenant, index) => ({ _id: new mongoose.Types.ObjectId(), tenantId: tenant._id, name: `Owner ${index}`, email: `owner${index}@spec.test`, passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), pinVersion: 0, sessionVersion: 0, pinRequiresChange: false, role: 'owner', isActive: true, superAdmin: false, branchIds: [] })));
qa\api-integration.cjs:36:  await database.collection('users').insertMany(owners);
qa\api-integration.cjs:38:  child = spawn(process.execPath, ['-r', path.join(root, 'qa/recovery-provider-hook.cjs'), 'dist/main.js'], { cwd: path.join(root, 'apps/api'), env: { ...process.env, PORT: String(port), MONGO_URI: uri, REDIS_URL: 'redis://127.0.0.1:6379/0', BULL_PREFIX: prefix, JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), PLATFORM_DEVELOPER_EMAIL: 'developer@spec.test', PLATFORM_DEVELOPER_SETUP_TOKEN: setupToken, CORS_ORIGIN: 'http://localhost:5173', THROTTLE_LIMIT: '10000', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(recoveryFixtures.smtpPort), SMTP_SECURE: 'false', SMTP_USER: 'test@spec.test', SMTP_PASSWORD: randomBytes(16).toString('hex'), SMTP_FROM: 'test@spec.test', TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'test-only', TWILIO_WHATSAPP_FROM: '+15005550006', TWILIO_WHATSAPP_CONTENT_SID: 'HX-test', RECOVERY_TEST_PROVIDER: recoveryFixtures.whatsappUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
qa\api-integration.cjs:70:    assert.equal(await database.collection('orders').countDocuments({ tenantId: tenants[0]._id }), 1);
qa\api-integration.cjs:128:      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': false, 'featureFlags.pos': false } });
qa\api-integration.cjs:131:      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.barcodes': false } });
qa\api-integration.cjs:134:    } finally { await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': true, 'featureFlags.pos': true, 'featureFlags.barcodes': true } }); }
qa\api-integration.cjs:184:    await database.collection('users').updateOne({ email }, { $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:198:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { phone: '+923001234567', phoneVerified: true, phoneVerifiedAt: null }, $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:204:    const stored = await database.collection('recoverychallenges').findOne({ challengeId: sent.data.challengeId });
qa\api-integration.cjs:211:    assert.equal((await database.collection('users').findOne({ _id: owners[0]._id })).phoneVerified, true);
qa\api-integration.cjs:225:    await database.collection('recoverychallenges').updateOne({ challengeId: expired.challengeId }, { $set: { expiresAt: new Date(0) } });
qa\api-integration.cjs:229:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: 'changed@spec.test', emailVerified: true, emailVerifiedAt: new Date() } });
qa\api-integration.cjs:231:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: null, emailVerified: false, emailVerifiedAt: null } });
qa\api-integration.cjs:235:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:237:    assert.equal(await database.collection('recoverychallenges').countDocuments({ userId: owners[0]._id }), 0);
qa\api-integration.cjs:240:  await database.collection('users').insertOne({ tenantId: tenants[1]._id, name: 'Test platform admin', email: 'super@spec.test', passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), role: 'owner', superAdmin: true, isActive: true, pinVersion: 0 });
qa\api-integration.cjs:248:      const account = await database.collection('users').findOne({ email }); assert.ok(await bcrypt.compare('updated-password-123', account.passwordHash));
qa\api-integration.cjs:256:    const account = await database.collection('users').findOne({ email: 'cashier@spec.test' });
qa\api-integration.cjs:257:    await database.collection('users').updateOne({ _id: account._id }, { $set: { phone: '+923001234568', phoneVerified: true, phoneVerifiedAt: new Date() } });
qa\api-integration.cjs:272:    await database.collection('users').updateOne({ email: owners[0].email }, { $unset: { securityCodeRequestedAt: 1 } });
qa\recovery-provider-hook.cjs:2:if (!/\/pos_spec_test_\d+_[a-f0-9]{8}$/.test(process.env.MONGO_URI || '') || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.RECOVERY_TEST_PROVIDER || '')) throw new Error('Recovery provider fixture requires a disposable test database and loopback sink.');
apps\pdf-worker\src\worker.ts:5:import { MongoClient } from 'mongodb';
apps\pdf-worker\src\worker.ts:13:  const mongo = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/pos');
apps\pdf-worker\src\worker.ts:15:  const orders = mongo.db().collection('orders');
apps\api\src\common\pipes\parse-object-id.pipe.ts:2:import { isValidObjectId } from 'mongoose';
apps\api\src\common\pipes\parse-object-id.pipe.ts:5:export class ParseObjectIdPipe implements PipeTransform<string, string> {
apps\api\src\common\object-id.ts:1:import { Types } from 'mongoose';
apps\api\src\cli\init-super-admin.ts:1:import mongoose from 'mongoose';
apps\api\src\cli\init-super-admin.ts:4:  const mongoUri = process.env.MONGO_URI;
apps\api\src\cli\init-super-admin.ts:6:  if (!mongoUri) throw new Error('MONGO_URI is required');
apps\api\src\cli\init-super-admin.ts:9:  await mongoose.connect(mongoUri);
apps\api\src\cli\init-super-admin.ts:11:    const users = mongoose.connection.collection('users');
apps\api\src\cli\init-super-admin.ts:12:    await users.createIndex({ superAdmin: 1 }, {
apps\api\src\cli\init-super-admin.ts:29:    await mongoose.disconnect();
apps\api\src\modules\tenant\tenant.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\tenant\tenant.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\tenant\tenant.service.ts:10:  constructor(@InjectModel(Tenant.name) private readonly model: Model<Tenant>) {}
apps\api\src\app.module.ts:5:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\app.module.ts:37:      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGO_URI') }),
apps\api\src\modules\stock\stock.module.ts:2:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\stock\stock.module.ts:4:import { IsMongoId, IsNumber, IsString, IsUUID, Length } from 'class-validator';
apps\api\src\modules\stock\stock.module.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\stock\stock.module.ts:25:class AdjustStockDto { @IsMongoId() productId: string; @IsUUID() idempotencyKey: string; @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }) delta: number; @IsString() @Length(3, 300) reason: string; }
apps\api\src\modules\stock\stock.module.ts:27:  constructor(@InjectModel(StockAdjustment.name) private readonly adjustments: Model<StockAdjustment>, private readonly products: ProductService) {}
apps\api\src\common\branch-scope.ts:2:import { Schema, Types } from 'mongoose';
apps\pdf-worker\src\queue\invoice.processor.ts:2:import { Collection, ObjectId } from 'mongodb';
apps\api\src\modules\report\report.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\report\report.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\report\report.service.ts:26:    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
apps\api\src\modules\report\report.service.ts:55:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:58:          $group: {
apps\api\src\modules\report\report.service.ts:68:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:71:          $group: {
apps\api\src\modules\report\report.service.ts:79:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:83:          $group: {
apps\api\src\modules\report\report.service.ts:93:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:95:        { $group: { _id: '$paymentMode', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
apps\api\src\modules\report\report.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-sale.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-sale.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\installment\schemas\installment-product.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-product.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\installment\installment.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\tenant\tenant.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-plan.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-plan.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\health\health.module.ts:2:import { InjectConnection } from '@nestjs/mongoose';
apps\api\src\modules\health\health.module.ts:3:import { Connection } from 'mongoose';
apps\api\src\modules\health\health.module.ts:9:  constructor(@InjectConnection() private readonly database: Connection) {}
apps\api\src\modules\installment\installment.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\installment\installment.controller.ts:57:  findProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:69:  updateProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateInstallmentProductDto) {
apps\api\src\modules\installment\installment.controller.ts:75:  removeProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:85:  findSale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:95:  paySale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordInstallmentSalePaymentDto) {
apps\api\src\modules\installment\installment.controller.ts:100:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:105:  pay(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordPaymentDto) {
apps\api\src\modules\installment\installment.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\installment\installment.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\installment\installment.service.ts:45:    @InjectModel(InstallmentPlan.name) private readonly model: Model<InstallmentPlan>,
apps\api\src\modules\installment\installment.service.ts:46:    @InjectModel(InstallmentProduct.name) private readonly productModel: Model<InstallmentProduct>,
apps\api\src\modules\installment\installment.service.ts:47:    @InjectModel(InstallmentSale.name) private readonly saleModel: Model<InstallmentSale>,
apps\api\src\modules\installment\dto\installment.dto.ts:5:  IsIn, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
apps\api\src\modules\installment\dto\installment.dto.ts:13:  @ApiProperty() @IsMongoId() customerId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:41:  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
apps\api\src\modules\installment\dto\installment.dto.ts:71:  @ApiProperty() @IsMongoId() customerId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:72:  @ApiProperty() @IsMongoId() installmentProductId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:91:  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
apps\api\src\modules\developer\developer.controller.ts:9:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\developer\developer.controller.ts:39:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:48:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:86:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:95:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:109:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:118:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:137:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\tenant\schemas\tenant.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\tenant\schemas\tenant.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\product\schemas\product.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\product\schemas\product.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\customer\schemas\customer.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\customer\schemas\customer.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\product\product.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\product\product.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\product\product.service.ts:11:  constructor(@InjectModel(Product.name) private readonly model: Model<Product>) {}
apps\api\src\modules\product\product.service.ts:112:      { $inc: { stockQty: -qty } },
apps\api\src\modules\product\product.service.ts:118:    await this.model.updateOne({ _id: productId, tenantId: oid(tenantId) }, { $inc: { stockQty: qty } });
apps\api\src\modules\product\product.service.ts:123:    const result = await this.model.updateOne({ _id: productId, tenantId: oid(tenantId), restoredSaleEvents: { $ne: event } }, { $inc: { stockQty: qty }, $addToSet: { restoredSaleEvents: event } });
apps\api\src\modules\product\product.service.ts:128:    const updated = await this.model.findOneAndUpdate({ _id: productId, tenantId: oid(tenantId), stockAdjustmentEvents: { $ne: key }, ...(delta < 0 ? { stockQty: { $gte: -delta } } : {}) }, { $inc: { stockQty: delta }, $addToSet: { stockAdjustmentEvents: key } }, { new: true });
apps\api\src\modules\invoice\invoice.service.ts:4:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\invoice\invoice.service.ts:8:import { Model } from 'mongoose';
apps\api\src\modules\invoice\invoice.service.ts:22:    @InjectModel(Order.name) private readonly orders: Model<Order>,
apps\api\src\modules\product\product.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\product\product.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\product\product.controller.ts:26:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\product\product.controller.ts:47:  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto) {
apps\api\src\modules\product\product.controller.ts:54:  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.module.ts:3:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\customer\customer.service.ts:10:  constructor(@InjectModel(Customer.name) private readonly model: Model<Customer>) {}
apps\api\src\modules\invoice\invoice.controller.ts:10:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\invoice\invoice.controller.ts:22:  async status(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.controller.ts:28:  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.controller.ts:40:  regenerate(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\customer\customer.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.controller.ts:6:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\customer\customer.controller.ts:23:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\customer\customer.controller.ts:33:  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCustomerDto) {
apps\api\src\modules\super-admin\schemas\subscription-plan.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\subscription-plan.schema.ts:2:import { HydratedDocument } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:23:    @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>,
apps\api\src\modules\super-admin\super-admin.service.ts:24:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\super-admin\super-admin.service.ts:25:    @InjectModel(SubscriptionPlan.name) private readonly plans: Model<SubscriptionPlan>,
apps\api\src\modules\super-admin\super-admin.service.ts:26:    @InjectModel(AdminAudit.name) private readonly audits: Model<AdminAudit>,
apps\api\src\modules\super-admin\super-admin.service.ts:27:    @InjectModel(PlatformModule.name) private readonly platformModules: Model<PlatformModule>,
apps\api\src\modules\branch\branch.module.ts:3:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\branch\branch.module.ts:6:import { Model, Types } from 'mongoose';
apps\api\src\modules\branch\branch.module.ts:12:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\branch\branch.module.ts:30:  constructor(@InjectModel(Branch.name) private readonly branches: Model<Branch>, @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>) {}
apps\api\src\modules\branch\branch.module.ts:35:    const tenant = await this.tenants.findOneAndUpdate({ _id: user.tenantId, $expr: { $lt: [{ $ifNull: ['$branchCount', 0] }, { $ifNull: ['$branchLimit', 1] }] } }, { $inc: { branchCount: 1 } }, { new: true });
apps\api\src\modules\branch\branch.module.ts:41:    } catch (error) { await this.tenants.updateOne({ _id: tenant._id }, { $inc: { branchCount: -1 } }); if ((error as { code?: number }).code === 11000) throw new ConflictException('Branch code already exists'); throw error; }
apps\api\src\modules\branch\branch.module.ts:65:  @Patch(':id') @Roles(Role.Owner, Role.Admin) update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateBranchDto) { return this.branches.update(user, id, dto); }
apps\api\src\modules\super-admin\schemas\platform-module.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\platform-module.schema.ts:2:import { HydratedDocument } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\admin-audit.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\admin-audit.schema.ts:2:import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
apps\api\src\modules\order\schemas\order.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\order.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.controller.ts:7:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\super-admin\super-admin.controller.ts:37:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\super-admin\super-admin.controller.ts:46:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\order\schemas\invoice-counter.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\invoice-counter.schema.ts:2:import { Types } from 'mongoose';
apps\api\src\modules\order\schemas\checkout-request.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\checkout-request.schema.ts:2:import { Types } from 'mongoose';
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:4:  IsBoolean, IsEmail, IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Max,
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:43:  @IsOptional() @IsMongoId() initialPlanId?: string;
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:76:  @IsMongoId() subscriptionPlanId: string;
apps\api\src\modules\order\order.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\order\order.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\order\order.service.ts:25:    @InjectModel(Order.name) private readonly orders: Model<Order>,
apps\api\src\modules\order\order.service.ts:26:    @InjectModel(InvoiceCounter.name) private readonly counters: Model<InvoiceCounter>,
apps\api\src\modules\order\order.service.ts:27:    @InjectModel(CheckoutRequest.name) private readonly checkouts: Model<CheckoutRequest>,
apps\api\src\modules\order\order.service.ts:177:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:179:        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 }, tax: { $sum: '$taxTotal' }, discounts: { $sum: '$discountTotal' } } },
apps\api\src\modules\order\order.service.ts:181:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:183:        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
apps\api\src\modules\order\order.service.ts:186:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:189:        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
apps\api\src\modules\order\order.service.ts:226:      { $inc: { lastNumber: 1 } },
apps\api\src\modules\barcode\barcode.dto.ts:3:import { IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
apps\api\src\modules\barcode\barcode.dto.ts:10:  @ApiPropertyOptional() @IsOptional() @IsMongoId() productId?: string;
apps\api\src\modules\order\dto\order.dto.ts:4:  ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
apps\api\src\modules\order\dto\order.dto.ts:11:  @ApiProperty() @IsMongoId() productId: string;
apps\api\src\modules\order\order.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\auth\schemas\user.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\auth\schemas\user.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\order\order.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\order\order.controller.ts:44:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\order\order.controller.ts:50:  void(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\order\order.controller.ts:55:  refund(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RefundOrderDto) { return this.orders.refund(user, id, dto.reason); }
apps\api\src\modules\auth\recovery.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\recovery.service.ts:4:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\auth\recovery.service.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\auth\recovery.service.ts:29:  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(RecoveryChallenge.name) private readonly challenges: Model<RecoveryChallenge>, private readonly config: ConfigService, private readonly email: EmailService) {}
apps\api\src\modules\auth\recovery.service.ts:86:    const challenge = await this.challenges.findOneAndUpdate({ challengeId: dto.challengeId, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(phoneUserId ? { userId: new Types.ObjectId(phoneUserId), purpose: 'phone-verification' } : { purpose: { $ne: 'phone-verification' } }) }, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash');
apps\api\src\modules\auth\recovery.service.ts:100:    const updated = await this.users.updateOne({ _id: user._id, isActive: true, ...this.versions(challenge), email: user.email, recoveryEmail: user.recoveryEmail ?? null, phone: user.phone ?? null, emailVerifiedAt: user.emailVerifiedAt ?? null, phoneVerifiedAt: user.phoneVerifiedAt ?? null }, { $set: { [field]: hash, pinFailedAttempts: 0, pinLockedUntil: null, ...(field === 'pinHash' ? { pinRequiresChange: false, pinEnabled: true } : {}) }, $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 }, $unset: { pinChallengeId: 1, pinResetCodeHash: 1, pinResetExpiresAt: 1, emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } });
apps\api\src\modules\auth\dto\auth.dto.ts:2:import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsMongoId, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
apps\api\src\modules\auth\dto\auth.dto.ts:69:  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
apps\api\src\modules\auth\dto\auth.dto.ts:81:  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
apps\api\src\modules\auth\dto\auth.dto.ts:116:  @ApiProperty() @IsMongoId() staffId: string;
apps\api\src\modules\audit\audit.module.ts:3:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\audit\audit.module.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\audit\audit.module.ts:25:  constructor(@InjectModel(AuditEvent.name) private readonly events: Model<AuditEvent>) {}
apps\api\src\modules\auth\jwt.strategy.ts:1:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\jwt.strategy.ts:5:import { Model } from 'mongoose';
apps\api\src\modules\auth\jwt.strategy.ts:21:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\auth.module.ts:3:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\auth\password-recovery.service.ts:10:import { InjectModel } from "@nestjs/mongoose";
apps\api\src\modules\auth\password-recovery.service.ts:11:import { Model, Schema, Types } from "mongoose";
apps\api\src\modules\auth\password-recovery.service.ts:98:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\password-recovery.service.ts:105:    this.tokens = userModel.collection.conn.collection('password_reset_tokens') as never as {
apps\api\src\modules\auth\password-recovery.service.ts:109:    this.codes = userModel.collection.conn.collection('recovery_codes') as never as {
apps\api\src\modules\auth\password-recovery.service.ts:124:    return this.users.collection.conn.collection('password_reset_tokens');
apps\api\src\modules\auth\password-recovery.service.ts:128:    return this.users.collection.conn.collection('recovery_codes');
apps\api\src\modules\auth\password-recovery.service.ts:190:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\password-recovery.service.ts:254:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\password-recovery.service.ts:297:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\auth.controller.ts:2:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\auth\auth.controller.ts:125:  updateStaffRights(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffRightsDto) {
apps\api\src\modules\auth\auth.controller.ts:130:  updateStaffStatus(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffStatusDto) { return this.auth.updateStaffStatus(user, id, dto.isActive); }
apps\api\src\modules\auth\auth.service.ts:7:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\auth.service.ts:10:import { Model } from 'mongoose';
apps\api\src\modules\auth\auth.service.ts:37:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\auth.service.ts:133:      await this.users.updateOne({ _id: user._id }, { $inc: { pinFailedAttempts: 1 }, ...(failed >= 5 ? { $set: { pinLockedUntil: new Date(Date.now() + 15 * 60_000) } } : {}) });
apps\api\src\modules\auth\auth.service.ts:162:    await this.users.updateOne({ _id: user._id }, { $inc: { developerSessionVersion: 1 } });
apps\api\src\modules\auth\auth.service.ts:222:        ...(dto.newPin ? { $inc: { pinVersion: 1 } } : {}),
apps\api\src\modules\auth\auth.service.ts:323:    const staff = await this.users.findOneAndUpdate({ _id: staffId, tenantId: oid(actor.tenantId), role: { $ne: Role.Owner }, superAdmin: { $ne: true } }, { $set: { isActive }, $inc: { sessionVersion: 1 } }, { new: true });
apps\api\src\modules\auth\auth.service.ts:329:    await this.users.updateOne({ _id: userId }, { $inc: { sessionVersion: 1, developerSessionVersion: 1 } });
apps\api\src\modules\auth\auth.service.ts:345:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\recovery.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
```

Deployment/configuration dependencies: `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, application environment examples, API/PDF-worker package manifests and lockfiles, Dockerfiles, `.github/workflows/ci.yml`, `scripts/seed.ts`, `docs/erd.md` and `docs/api-spec.yaml`. Existing CI integration fixtures use disposable MongoDB databases and must be ported to isolated PostgreSQL databases. Runtime health checks also depend on the Mongoose connection.
