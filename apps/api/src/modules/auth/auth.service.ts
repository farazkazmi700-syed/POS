import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Role } from '../../common/enums';
import { oid } from '../../common/object-id';
import { TenantService } from '../tenant/tenant.service';
import { CreateStaffDto, LoginDto, RegisterDto, UpdateProfileDto, VerifyRecoveryDto } from './dto/auth.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly tenants: TenantService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Creates a new business (tenant) together with its owner account. */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');

    const tenant = await this.tenants.create({
      name: dto.businessName, domainType: dto.domainType,
      taxRegNo: dto.taxRegNo, address: dto.address, currency: dto.currency?.toUpperCase(),
    });
    try {
      const user = await this.users.create({
        tenantId: tenant._id, name: dto.ownerName, email,
        passwordHash: await bcrypt.hash(dto.password, 12), role: Role.Owner,
      });
      return this.issueTokens(user);
    } catch (err) {
      await this.tenants.delete(tenant.id); // don't leave an orphan tenant behind
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .findOne({ email: dto.email.toLowerCase(), isActive: true })
      .select('+passwordHash');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.users.findOne({ _id: payload.sub, isActive: true });
      if (!user) throw new Error('inactive');
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');
    const user = await this.users.create({
      tenantId: oid(tenantId), name: dto.name, email,
      passwordHash: await bcrypt.hash(dto.password, 12), role: dto.role,
    });
    return this.publicUser(user);
  }

  async listStaff(tenantId: string) {
    const users = await this.users.find({ tenantId: oid(tenantId) }).sort({ createdAt: 1 });
    return users.map((u) => this.publicUser(u));
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (dto.name) user.name = dto.name.trim();
    if (dto.recoveryEmail !== undefined) {
      const recoveryEmail = dto.recoveryEmail ? dto.recoveryEmail.trim().toLowerCase() : null;
      user.recoveryEmail = recoveryEmail;
      user.emailVerified = recoveryEmail === user.email ? true : user.emailVerified;
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone ? dto.phone.trim() : null;
      user.phone = phone;
      user.phoneVerified = false;
    }

    await user.save();
    return this.publicUser(user);
  }

  async verifyRecovery(userId: string, dto: VerifyRecoveryDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (dto.type === 'email') {
      if (!user.recoveryEmail || user.recoveryEmail.toLowerCase() !== user.email.toLowerCase()) {
        throw new BadRequestException('Add a valid recovery email before verification.');
      }
      user.emailVerified = true;
    }

    if (dto.type === 'phone') {
      if (!user.phone || user.phone.trim().length < 7) {
        throw new BadRequestException('Add a valid phone number before verification.');
      }
      user.phoneVerified = true;
    }

    await user.save();
    return this.publicUser(user);
  }

  private publicUser(user: UserDocument) {
    return {
      _id: user.id, tenantId: user.tenantId.toString(), name: user.name,
      email: user.email, phone: user.phone ?? undefined,
      recoveryEmail: user.recoveryEmail ?? undefined,
      emailVerified: user.emailVerified ?? false,
      phoneVerified: user.phoneVerified ?? false,
      role: user.role, isActive: user.isActive,
    };
  }

  private async issueTokens(user: UserDocument) {
    const base = { sub: user.id, tenantId: user.tenantId.toString() };
    const accessToken = await this.jwt.signAsync(
      { ...base, role: user.role, email: user.email, name: user.name },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync(base, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d') as never,
    });
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }
}
