import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { FeatureGuard } from './common/guards/feature.guard';
import { DeveloperScopeGuard } from './common/guards/developer-scope.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ModuleRightsGuard } from './common/guards/module-rights.guard';
import { ActionPermissionsGuard } from './common/guards/action-permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { InstallmentModule } from './modules/installment/installment.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { OrderModule } from './modules/order/order.module';
import { ProductModule } from './modules/product/product.module';
import { ReportModule } from './modules/report/report.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { BranchModule } from './modules/branch/branch.module';
import { BranchGuard } from './common/guards/branch.guard';
import { StockModule } from './modules/stock/stock.module';
import { BarcodeModule } from './modules/barcode/barcode.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGO_URI') }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
        return {
          prefix: config.get<string>('BULL_PREFIX', 'bull'),
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            db: Number(url.pathname.slice(1) || 0),
            password: url.password ? decodeURIComponent(url.password) : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL') || 60_000),
          limit: Number(config.get('THROTTLE_LIMIT') || 2000),
        },
      ],
    }),
    AuthModule, TenantModule, ProductModule, OrderModule, InvoiceModule, CustomerModule, InstallmentModule, SupportModule,
    SuperAdminModule, DeveloperModule, ReportModule, BranchModule, AuditModule, HealthModule, StockModule, BarcodeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // runs first: populates req.user
    { provide: APP_GUARD, useClass: AppThrottlerGuard }, // user-aware tracking, configurable limits & skip
    { provide: APP_GUARD, useClass: DeveloperScopeGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: BranchGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ActionPermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleRightsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}
