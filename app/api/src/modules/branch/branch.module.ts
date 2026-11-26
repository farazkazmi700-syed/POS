import { BadRequestException, Body, CallHandler, ConflictException, Controller, Delete, ExecutionContext, ForbiddenException, Get, Global, Injectable, Module, NestInterceptor, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { Model, Types } from 'mongoose';
import { Observable } from 'rxjs';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { branchContext } from '../../common/branch-scope';
import { Tenant, TenantSchema } from '../tenant/schemas/tenant.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';

@Schema({ timestamps: true }) export class Branch {
  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop() address?: string;
  @Prop({ default: true }) isActive: boolean;
}
const schema = SchemaFactory.createForClass(Branch);
schema.index({ tenantId: 1, code: 1 }, { unique: true });
class CreateBranchDto { @IsString() @Length(2, 100) name: string; @IsString() @Length(2, 20) code: string; @IsOptional() @IsString() @MaxLength(300) address?: string; }
class UpdateBranchDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() @Length(2, 100) name?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @Length(2, 20) code?: string;
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(300) address?: string;
  @ValidateIf((_, value) => value !== undefined) @IsBoolean() isActive?: boolean;
}

@Injectable() export class BranchService {
  constructor(
    @InjectModel(Branch.name) private readonly branches: Model<Branch>,
    @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}
  list(user: AuthUser) { return this.branches.find({ tenantId: new Types.ObjectId(user.tenantId), ...(user.role !== Role.Owner ? { _id: { $in: (user.branchIds ?? []).map((id) => new Types.ObjectId(id)) } } : {}) }).sort({ name: 1 }); }
  async validate(tenantId: string, id: string) { if (!Types.ObjectId.isValid(id) || !await this.branches.exists({ _id: id, tenantId: new Types.ObjectId(tenantId), isActive: true })) throw new ForbiddenException('Branch is unavailable or belongs to another business'); }
  async create(user: AuthUser, dto: CreateBranchDto) {
    if (dto.name.trim().length < 2 || !/^[A-Za-z0-9_-]{2,20}$/.test(dto.code.trim())) throw new BadRequestException('Use a branch name and a 2–20 character alphanumeric code');
    const tenant = await this.tenants.findOneAndUpdate({ _id: user.tenantId, $expr: { $lt: [{ $ifNull: ['$branchCount', 0] }, { $ifNull: ['$branchLimit', 1] }] } }, { $inc: { branchCount: 1 } }, { new: true });
    if (!tenant) throw new ForbiddenException('Branch limit reached. Contact the platform owner.');
    const branchId = new Types.ObjectId();
    const adminFilter = { _id: user.userId, tenantId: tenant._id, role: Role.Admin };
    let adminAssigned = false;
    let branch;
    try {
      if (user.role === Role.Admin) {
        const assigned = await this.users.updateOne(adminFilter, { $addToSet: { branchIds: branchId } });
        if (!assigned.matchedCount) throw new ForbiddenException('Administrator is unavailable');
        adminAssigned = true;
      }
      branch = await this.branches.create({
        _id: branchId, tenantId: tenant._id, name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(), address: dto.address?.trim(),
      });
    } catch (error) {
      await Promise.all([
        this.tenants.updateOne({ _id: tenant._id }, { $inc: { branchCount: -1 } }),
        ...(adminAssigned ? [this.users.updateOne(adminFilter, { $pull: { branchIds: branchId } })] : []),
      ]);
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Branch code already exists');
      throw error;
    }
    await this.tenants.updateOne({ _id: tenant._id, defaultBranchId: null }, { $set: { defaultBranchId: branch._id } });
    return branch;
  }
  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    if (user.role !== Role.Owner && !user.branchIds?.includes(id)) throw new ForbiddenException('Branch is outside your scope');
    if (dto.isActive === false) {
      const tenant = await this.tenants.findById(user.tenantId);
      if (tenant?.defaultBranchId?.equals(id)) throw new ForbiddenException('The default branch cannot be disabled');
    }
    const changes = { ...dto };
    if (dto.name !== undefined) {
      changes.name = dto.name.trim();
      if (changes.name.length < 2) throw new BadRequestException('Enter a branch name with at least 2 characters');
    }
    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (!/^[A-Za-z0-9_-]{2,20}$/.test(code)) throw new BadRequestException('Use 2 to 20 letters, numbers, underscores, or hyphens for the branch code');
      changes.code = code.toUpperCase();
    }
    if (dto.address !== undefined) changes.address = dto.address.trim();
    try {
      const branch = await this.branches.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(user.tenantId) }, { $set: changes }, { new: true });
      if (!branch) throw new NotFoundException('Branch not found');
      return branch;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Branch code already exists');
      throw error;
    }
  }
}

@Injectable() class BranchContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user?.branchId) return next.handle();
    return new Observable((subscriber) => branchContext.run({ tenantId: user.tenantId, branchId: user.branchId!, defaultBranchId: user.defaultBranchId }, () => next.handle().subscribe(subscriber)));
  }
}

@ApiTags('branches') @ApiBearerAuth() @Controller('branches')
class BranchController {
  constructor(private readonly branches: BranchService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.branches.list(user); }
  @Post() @Roles(Role.Owner, Role.Admin) create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) { return this.branches.create(user, dto); }
  @Patch(':id') @Roles(Role.Owner, Role.Admin) update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateBranchDto) { return this.branches.update(user, id, dto); }
  @Delete(':id') @Roles(Role.Owner, Role.Admin) deactivate(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) { return this.branches.update(user, id, { isActive: false }); }
}

@Global() @Module({ imports: [MongooseModule.forFeature([{ name: Branch.name, schema }, { name: Tenant.name, schema: TenantSchema }, { name: User.name, schema: UserSchema }])], controllers: [BranchController], providers: [BranchService, { provide: APP_INTERCEPTOR, useClass: BranchContextInterceptor }], exports: [BranchService] })
export class BranchModule {}
