import { BackupDeliveryService } from './backup-delivery.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { DeveloperController } from './developer.controller';

@Module({
  imports: [SuperAdminModule, AuthModule],
  providers: [BackupDeliveryService],
  controllers: [DeveloperController],
})
export class DeveloperModule {}