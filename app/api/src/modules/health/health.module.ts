import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health') @Controller('health')
class HealthController {
  constructor(@InjectConnection() private readonly database: Connection) {}
  @Public() @Get() async ready() {
    if (this.database.readyState !== 1) throw new ServiceUnavailableException('Database unavailable');
    await this.database.db!.command({ ping: 1 });
    return { status: 'ok', database: 'connected', time: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()) };
  }
}
@Module({ controllers: [HealthController] }) export class HealthModule {}
