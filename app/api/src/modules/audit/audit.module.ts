import { CallHandler, Controller, ExecutionContext, Get, Global, Injectable, Module, NestInterceptor, Query } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { concatMap } from 'rxjs';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) resource: string;
  @Prop({ type: Types.ObjectId }) branchId?: Types.ObjectId;
  @Prop({ type: Object }) details?: Record<string, unknown>;
}
const schema = SchemaFactory.createForClass(AuditEvent);
schema.index({ tenantId: 1, createdAt: -1 });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const) schema.pre(operation, function () { throw new Error('Audit events are append only'); });

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEvent.name) private readonly events: Model<AuditEvent>) {}
  record(user: Pick<AuthUser, 'tenantId' | 'userId' | 'branchId'>, action: string, resource: string, details?: Record<string, unknown>) {
    return this.events.create({ tenantId: new Types.ObjectId(user.tenantId), branchId: user.branchId ? new Types.ObjectId(user.branchId) : undefined, actorId: user.userId, action, resource, details });
  }
  async list(user: AuthUser, page = 1, limit = 30) {
    page = Number.isInteger(page) && page > 0 ? page : 1;
    limit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;
    const filter = { tenantId: new Types.ObjectId(user.tenantId), ...(user.role !== 'owner' && user.branchId ? { branchId: new Types.ObjectId(user.branchId) } : {}) };
    const [data, total] = await Promise.all([this.events.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.events.countDocuments(filter)]);
    return { data, total, page, limit };
  }
}

@Injectable()
class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    if (!request.user || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next.handle();
    return next.handle().pipe(concatMap(async (result) => {
      // Never persist bodies, credentials, tokens, PINs, or personal contact fields.
      const isBranchWrite = Reflect.getMetadata(PATH_METADATA, context.getClass()) === 'branches';
      const branchId = isBranchWrite && result?._id ? String(result._id) : undefined;
      const actor = branchId ? { ...request.user, branchId } : request.user;
      await this.audit.record(actor, request.method, request.route?.path ?? request.path, {
        resourceId: branchId ?? request.params?.id ?? null,
        status: context.switchToHttp().getResponse().statusCode,
      });
      return result;
    }));
  }
}

@ApiTags('audit') @ApiBearerAuth() @Controller('audit')
class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query('page') page?: string, @Query('limit') limit?: string) { return this.audit.list(user, Number(page ?? 1), Number(limit ?? 30)); }
}

@Global() @Module({ imports: [MongooseModule.forFeature([{ name: AuditEvent.name, schema }])], providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }], controllers: [AuditController], exports: [AuditService] })
export class AuditModule {}
