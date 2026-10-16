import { Module } from '@nestjs/common';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { DeveloperController } from './developer.controller';

@Module({
  imports: [SuperAdminModule],
  controllers: [DeveloperController],
})
export class DeveloperModule {}