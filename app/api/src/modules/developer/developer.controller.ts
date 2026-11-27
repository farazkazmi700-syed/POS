import { BackupDeliveryDto, BackupDeliveryService } from './backup-delivery.service';
import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { configuredDataSyncBusiness } from '../support/data-sync-destination';
import { TenantTrashService } from './tenant-trash.service';
import { ModuleRegistryService } from '../super-admin/module-registry.service';
import { Throttle } from '@nestjs/throttler';
import { PasswordRecoveryService } from '../auth/password-recovery.service';
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

class TrashBusinessDto {
  @IsString() @MaxLength(120) name: string;
  @IsBoolean() confirmed: boolean;
}

@ApiTags('developer')
@ApiBearerAuth()
@AllowSuspendedTenant()
@AllowDeveloperScope()
@UseGuards(DeveloperGuard)
@Controller('developer')
export class DeveloperController {
  constructor(
    private readonly platform: SuperAdminService,
    private readonly delivery: BackupDeliveryService,
    private readonly recovery: PasswordRecoveryService,
    private readonly registry: ModuleRegistryService,
    private readonly tenantTrash: TenantTrashService,
    private readonly config: ConfigService,
  ) {}

  @Get('data-sync')
  @Header('Cache-Control', 'no-store')
  async dataSync() {
    const [key] = await this.registry.executableKeys(['data-sync']);
    return { moduleEnabled: key === 'data-sync', configuredBusinessId: configuredDataSyncBusiness(this.config) };
  }
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
  async clients(@CurrentUser() actor: AuthUser) {
    return (await this.platform.listClientAccounts()).filter((account) => account._id !== actor.userId);
  }

  @Post('clients/:businessId/:accountId/password-reset')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetClientPassword(
    @CurrentUser() actor: AuthUser,
    @Param('businessId', ParseObjectIdPipe) businessId: string,
    @Param('accountId', ParseObjectIdPipe) accountId: string,
  ) {
    return this.recovery.requestClientReset(businessId, accountId, actor);
  }

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

  @Get('businesses/trash')
  @Header('Cache-Control', 'no-store')
  trashList() { return this.tenantTrash.list(); }

  @Post('businesses/:id/trash')
  trashBusiness(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TrashBusinessDto, @CurrentUser() actor: AuthUser) {
    return this.tenantTrash.trash(id, dto.name, dto.confirmed, actor);
  }

  @Post('businesses/:id/restore')
  restoreBusiness(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.tenantTrash.restore(id, actor);
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
