import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { AllowDeveloperScope } from '../../common/decorators/developer-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeveloperGuard } from '../../common/guards/developer.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AssignPlanDto, CreateBusinessDto, CreatePlanDto, UpdateBusinessDto,
  UpdateBusinessFeaturesDto, UpdatePlanDto,
} from '../super-admin/dto/super-admin.dto';
import { SuperAdminService } from '../super-admin/super-admin.service';

@ApiTags('developer')
@ApiBearerAuth()
@AllowSuspendedTenant()
@AllowDeveloperScope()
@UseGuards(DeveloperGuard)
@Controller('developer')
export class DeveloperController {
  constructor(private readonly platform: SuperAdminService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('businesses')
  businesses() {
    return this.platform.listBusinessesForPlans();
  }

  @Post('businesses')
  createBusiness(@CurrentUser() actor: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.platform.createBusiness(dto, actor);
  }

  @Patch('businesses/:id')
  updateBusiness(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.platform.updateBusiness(id, dto, actor);
  }

  @Patch('businesses/:id/plan')
  assignPlan(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AssignPlanDto,
  ) {
    return this.platform.assignPlan(id, dto.subscriptionPlanId, actor);
  }

  @Patch('businesses/:id/features')
  updateFeatures(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBusinessFeaturesDto,
  ) {
    return this.platform.updateBusinessFeatures(id, dto.featureFlags, actor);
  }

  @Get('plans')
  plans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentUser() actor: AuthUser, @Body() dto: CreatePlanDto) {
    return this.platform.createPlan(dto, actor);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.platform.updatePlan(id, dto, actor);
  }

  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.platform.listAudit(limit);
  }
}