import { BackupDeliveryDto, BackupDeliveryService } from './backup-delivery.service';
import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { AllowDeveloperScope } from '../../common/decorators/developer-scope.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeveloperGuard } from '../../common/guards/developer.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AssignPlanDto, CreateBusinessDto, CreatePlanDto, CreatePlatformModuleDto, ProvisionTenantAccountsDto,
  UpdateBusinessDto, UpdateBusinessFeaturesDto, UpdatePlanDto, UpdatePlatformModuleDto,
} from '../super-admin/dto/super-admin.dto';
import { SuperAdminService } from '../super-admin/super-admin.service';

@ApiTags('developer')
@ApiBearerAuth()
@AllowSuspendedTenant()
@AllowDeveloperScope()
@UseGuards(DeveloperGuard)
@Controller('developer')
export class DeveloperController {
  constructor(private readonly platform: SuperAdminService, private readonly delivery: BackupDeliveryService) {}
  /** Public roadmap endpoint: any signed-in business account may read module labels & release states. */
  @Get('public-modules')
  @Public()
  @ApiOperation({ summary: 'Module roadmap visible to every signed-in business account' })
  publicModules() {
    return this.platform.listPublicModules();
  }
  @Get('features')
  features() { return this.platform.listFeatures(); }

  @Get('modules')
  modules() { return this.platform.listFeaturesDetailed(); }

  @Post('modules')
  createModule(@CurrentUser() actor: AuthUser, @Body() dto: CreatePlatformModuleDto) {
    return this.platform.createPlatformModule(dto, actor);
  }

  @Patch('modules/:id')
  updateModule(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePlatformModuleDto,
  ) {
    return this.platform.updatePlatformModule(id, dto, actor);
  }

  @Delete('modules/:id')
  deleteModule(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.platform.deletePlatformModule(id, actor);
  }

  @Get('clients')
  clients() { return this.platform.listClientAccounts(); }

  /** Developer-only sanitized logical export; not a physical database backup. */
  @Get('backup')
  @Header('Cache-Control', 'no-store')
  backup() { return this.platform.createBackup(); }

  @Get('backup/options')
  @Header('Cache-Control', 'no-store')
  backupOptions() { return this.delivery.options(); }

  @Post('backup/deliver')
  deliverBackup(@Body() dto: BackupDeliveryDto) { return this.delivery.deliver(dto.destination); }

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

  @Post('businesses/:id/accounts')
  provisionAccounts(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ProvisionTenantAccountsDto,
  ) {
    return this.platform.provisionAccounts(id, dto, actor);
  }

  @Get('role-packages')
  rolePackages() {
    return this.platform.listRolePackages();
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
