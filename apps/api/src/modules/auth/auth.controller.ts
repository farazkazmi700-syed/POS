import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthService } from './auth.service';
import {
  CreateStaffDto, LoginDto, RefreshDto, RegisterDto, UpdateProfileDto, VerifyRecoveryDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.userId, dto);
  }

  @ApiBearerAuth()
  @Post('me/verify-recovery')
  verifyRecovery(@CurrentUser() user: AuthUser, @Body() dto: VerifyRecoveryDto) {
    return this.auth.verifyRecovery(user.userId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Post('staff')
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.auth.createStaff(user.tenantId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Get('staff')
  listStaff(@CurrentUser() user: AuthUser) {
    return this.auth.listStaff(user.tenantId);
  }
}
