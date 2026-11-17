import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AllowDeveloperScope } from '../../common/decorators/developer-scope.decorator';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/auth-user';
import { EmailService } from './email.service';
import { User, UserSchema } from './schemas/user.schema';
import { RecoveryChallenge, RecoveryChallengeSchema, RecoveryService } from './recovery.service';
import { ConfirmOtpDto, RecoveryConfirmDto, RecoveryPhoneDto, RecoveryRequestDto } from './recovery.dto';

@ApiTags('account-recovery') @Controller('auth')
class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}
  @Public() @Get('recovery/options') options() { return this.recovery.options(); }
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('recovery/request') request(@Body() dto: RecoveryRequestDto) { return this.recovery.request(dto); }
  @Public() @Throttle({ default: { limit: 15, ttl: 60000 } }) @Post('recovery/confirm') confirm(@Body() dto: RecoveryConfirmDto) { return this.recovery.confirm(dto); }
  @ApiBearerAuth() @AllowDeveloperScope() @AllowSuspendedTenant() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('me/phone/request') phone(@CurrentUser() user: AuthUser, @Body() dto: RecoveryPhoneDto) { return this.recovery.requestPhone(user.userId, dto.phone); }
  @ApiBearerAuth() @AllowDeveloperScope() @AllowSuspendedTenant() @Throttle({ default: { limit: 15, ttl: 60000 } }) @Post('me/phone/confirm') confirmPhone(@CurrentUser() user: AuthUser, @Body() dto: ConfirmOtpDto) { return this.recovery.confirmPhone(user.userId, dto); }
}
@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: RecoveryChallenge.name, schema: RecoveryChallengeSchema }])], controllers: [RecoveryController], providers: [RecoveryService, EmailService], exports: [RecoveryService] })
export class RecoveryModule {}
