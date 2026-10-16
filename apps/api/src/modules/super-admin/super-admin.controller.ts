import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UpdateBusinessDto, UpdateBusinessFeaturesDto } from './dto/super-admin.dto';
import { SuperAdminService } from './super-admin.service';

@ApiTags('super-admin')
@ApiBearerAuth()
@AllowSuspendedTenant()
@UseGuards(SuperAdminGuard)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService) {}

  @Get('overview')
  overview() {
    return this.superAdmin.overview();
  }

  @Get('features')
  features() {
    return this.superAdmin.listFeatures();
  }

  @Get('businesses')
  businesses() {
    return this.superAdmin.listBusinesses();
  }

  @Patch('businesses/:id')
  updateBusiness(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.superAdmin.updateBusiness(id, dto, actor);
  }

  @Patch('businesses/:id/features')
  updateFeatures(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBusinessFeaturesDto,
  ) {
    return this.superAdmin.updateBusinessFeatures(id, dto.featureFlags, actor);
  }

  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.superAdmin.listAudit(limit);
  }
}