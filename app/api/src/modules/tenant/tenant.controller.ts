import { Body, Controller, ForbiddenException, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { canUpdateSettings } from './settings-access';
import { Role } from '../../common/enums';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantService } from './tenant.service';
import { AppearanceDto, AppearanceService } from './appearance.service';

@ApiTags('tenant')
@ApiBearerAuth()
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenants: TenantService, private readonly appearance: AppearanceService) {}

  @Get('me/appearance')
  getAppearance(@CurrentUser() user: AuthUser) {
    return this.appearance.read(user.tenantId);
  }

  @Patch('me/appearance')
  @Roles(Role.Owner)
  async setAppearance(@CurrentUser() user: AuthUser, @Body() dto: AppearanceDto) {
    const tenant = await this.tenants.findById(user.tenantId);
    if (!canUpdateSettings(user, tenant.featureFlags, {})) {
      throw new ForbiddenException('Your account cannot update business appearance');
    }
    return this.appearance.write(user.tenantId, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.tenants.findById(user.tenantId);
  }

  @Patch('me')
  @Roles(Role.Owner, Role.Admin)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenants.findById(user.tenantId);
    if (!canUpdateSettings(user, tenant.featureFlags, dto)) {
      throw new ForbiddenException('Your account cannot update settings for this module');
    }
    return this.tenants.update(user.tenantId, dto);
  }
}
