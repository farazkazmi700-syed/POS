import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Schema, Types } from "mongoose";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import * as bcrypt from "bcryptjs";
import { Role } from "../../common/enums";
import { EmailService } from "./email.service";
import { PasswordHashingService } from "./password-hashing.service";
import { passwordResetPage } from "./password-reset-url";
import { User } from "./schemas/user.schema";

/**
 * Password-policy constants: 12–128 characters, common passwords rejected.
 * Passphrases are allowed as long as they meet the length floor.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const ENROLLMENT_TTL_MS = 24 * 60 * 60 * 1000;
const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "password1234",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty12345",
  "qwertyuiop",
  "iloveyou123",
  "admin12345",
  "letmein123",
  "welcome123",
  "monkeybusiness",
  "football123",
  "abc123456",
  "111111111111",
  "aaaaaaaaaaaa",
  "masterpassword",
  "superadmin123",
  "changeme1234",
]);

export function validatePasswordPolicy(password: string): void {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(
      `Use a password of ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters (passphrases are welcome).`,
    );
  }
  if (COMMON_PASSWORDS.has(password.trim().toLowerCase())) {
    throw new BadRequestException(
      "That password is too common. Choose something unique.",
    );
  }
}

/** tenant/actor identifier recorded on audit-style events. */
export interface PasswordResetAudit {
  userId: Types.ObjectId;
  actorId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}

/**
 * Hybrid password recovery for tenant-local installations.
 *
 * The tenant database is the authentication authority: reset-token hashes,
 * recovery-code hashes and enrollment credentials all live beside the user
 * records. The central developer console can never set a local password
 * directly — only SMTP token delivery, an offline recovery code, or an
 * in-tenant authorized administrator reset changes credentials.
 *
 * Tokens: 256-bit random, SHA-256 hash stored, 15-minute expiry, atomically
 * consumed, never logged. Recovery codes: high-entropy, bcrypt-hashed,
 * single-use. No plaintext secret is persisted.
 */
@Injectable()
export class PasswordRecoveryService {
  /** Reset links point at this explicitly configured SPA URL; never built from request Host headers. */
  private readonly resetPage: URL;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly hashing: PasswordHashingService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    const resetBaseUrl = config.get<string>('PASSWORD_RESET_BASE_URL');
    if (!resetBaseUrl) {
      throw new Error('PASSWORD_RESET_BASE_URL is required. Set it to the frontend origin + /reset-password (e.g. http://localhost:8080/reset-password).');
    }
    this.resetPage = passwordResetPage(resetBaseUrl);
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private resetTokenCollection() {
    return this.users.collection.conn.collection('password_reset_tokens');
  }

  private recoveryCodeCollection() {
    return this.users.collection.conn.collection('recovery_codes');
  }

  // ------------------------------------------------------------------
  // Online email reset — single-use token, 15 minutes, hash-only storage
  // ------------------------------------------------------------------
  async requestEmailReset(email: string) {
    if (!this.email.isConfigured()) {
      throw new ServiceUnavailableException('Email delivery is not configured on this installation. Use an offline recovery code instead.');
    }
    const normalized = email.trim().toLowerCase();
    const generic = { challengeId: randomUUID(), message: 'If this email belongs to an active account, a reset link has been sent. The link expires in 15 minutes.' };
    const user = await this.users.findOne({ email: normalized, isActive: true });
    if (!user) {
      await bcrypt.hash(randomBytes(16).toString('hex'), 10); // keep timing similar
      return generic;
    }
    // Per-account throttle: minimum 60 seconds between reset requests.
    const reserved = await this.users.findOneAndUpdate(
      { _id: user._id, $or: [{ securityCodeRequestedAt: null }, { securityCodeRequestedAt: { $lte: new Date(Date.now() - 60_000) } }] },
      { $set: { securityCodeRequestedAt: new Date() } },
    );
    if (!reserved) return generic;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.sha256(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    const collection = this.resetTokenCollection();
    await collection.deleteMany({ userId: user._id });
    // Only the SHA-256 hash of the token is ever stored.
    await collection.findOneAndUpdate(
      { userId: user._id, tokenHash },
      { $setOnInsert: { userId: user._id, tokenHash, expiresAt, consumedAt: null, createdAt: new Date() } },
      { upsert: true } as object,
    );
    const destination = user.recoveryEmail && user.emailVerified && user.emailVerifiedAt ? user.recoveryEmail : user.email;
    try {
      const resetLink = new URL(this.resetPage);
      resetLink.hash = new URLSearchParams({ token }).toString();
      await this.email.sendPasswordResetLink(destination, resetLink.href);
    } catch {
      await collection.deleteMany({ userId: user._id });
      await this.users.updateOne({ _id: user._id }, { $set: { securityCodeRequestedAt: null } });
      throw new ServiceUnavailableException('The reset email could not be sent. Try again later.');
    }
    return generic;
  }

  /** Atomically consumes the token, stores an Argon2id hash, revokes sessions. */
  async confirmEmailReset(token: string, newPassword: string) {
    validatePasswordPolicy(newPassword);
    const tokenHash = this.sha256(token ?? '');
    // Claim the token atomically: consumedAt flips only for the first caller.
    const claimed = await this.resetTokenCollection().findOneAndUpdate(
      { tokenHash, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
    );
    if (!claimed) throw new BadRequestException('Invalid or expired reset link.');
    const userId = (claimed as unknown as { userId: Types.ObjectId }).userId;
    const passwordHash = await this.hashing.hashPassword(newPassword);
    const updated = await this.users.findOneAndUpdate(
      { _id: userId, isActive: true },
      {
        $set: { passwordHash, passwordRequiresChange: false },
        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
        $unset: { pinChallengeId: 1 },
      },
    );
    if (!updated) throw new BadRequestException('Account unavailable. Submit a new reset request.');
    return { message: 'Password updated. All sessions have been signed out - sign in with your new password.' };
  }

  // ------------------------------------------------------------------
  // Offline recovery codes — work with zero internet connectivity
  // ------------------------------------------------------------------
  static generateRecoveryCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 confusables
    const bytes = randomBytes(50);
    let code = '';
    for (let i = 0; i < 50; i++) {
      code += alphabet[bytes[i] % alphabet.length];
      if ((i + 1) % 5 === 0 && i < 49) code += '-';
    }
    return code;
  }

  /** Authenticated regeneration. Returns plaintext codes exactly once. */
  async rotateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: 10 }, () => PasswordRecoveryService.generateRecoveryCode());
    const docs = await Promise.all(codes.map(async (code) => ({
      userId: new Types.ObjectId(userId),
      codeHash: await bcrypt.hash(code, 10),
      consumedAt: null,
      createdAt: new Date(),
    })));
    const collection = this.recoveryCodeCollection();
    await collection.deleteMany({ userId: new Types.ObjectId(userId) });
    await collection.insertMany(docs);
    return codes;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.recoveryCodeCollection().countDocuments({ userId: new Types.ObjectId(userId), consumedAt: null });
  }

  /** Public offline flow: account email + one unused recovery code. */
  async recoverOffline(email: string, code: string, newPassword: string) {
    validatePasswordPolicy(newPassword);
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findOne({ email: normalized, isActive: true });
    if (!user) throw new BadRequestException('Invalid account or recovery code.');
    const candidates = (await this.recoveryCodeCollection().find({ userId: user._id, consumedAt: null }).toArray()) as Array<{ _id: Types.ObjectId; codeHash: string }>;
    let matched: { _id: Types.ObjectId } | null = null;
    for (const doc of candidates) {
      if (await bcrypt.compare(code.trim().toUpperCase(), doc.codeHash)) { matched = doc; break; }
    }
    if (!matched) throw new BadRequestException('Invalid account or recovery code.');
    // Atomically consume so two concurrent uses cannot both succeed.
    const consumed = await this.recoveryCodeCollection().findOneAndUpdate(
      { _id: matched._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );
    if (!consumed) throw new BadRequestException('Invalid account or recovery code.');
    const passwordHash = await this.hashing.hashPassword(newPassword);
    const updated = await this.users.findOneAndUpdate(
      { _id: user._id, isActive: true },
      {
        $set: { passwordHash, passwordRequiresChange: false },
        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
        $unset: { pinChallengeId: 1 },
      },
    );
    if (!updated) throw new BadRequestException('Account unavailable.');
    return { message: 'Password updated. All sessions were signed out - sign in with your new password.' };
  }

  // ------------------------------------------------------------------
  // Administrative reset: owner/admin resets staff, reauthentication required
  // ------------------------------------------------------------------
  async adminResetStaff(
    actor: { userId: string; tenantId: string; role: string },
    targetUserId: string,
    adminPassword: string,
  ) {
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new ForbiddenException('Only the business owner or an administrator can reset staff credentials.');
    }
    if (actor.userId === targetUserId) throw new BadRequestException('Use change-password for your own account.');
    const admin = await this.users.findOne({ _id: actor.userId, isActive: true }).select('+passwordHash');
    // Reauthentication: the administrator must prove their current password.
    if (!admin || !admin.passwordHash || !(await this.hashing.verifyPassword(adminPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Administrator password verification failed.');
    }
    if (actor.tenantId !== admin.tenantId.toString()) throw new ForbiddenException('Cross-tenant reset denied.');
    const target = await this.users.findOne({ _id: targetUserId, tenantId: new Types.ObjectId(actor.tenantId) });
    if (!target || target.role === 'owner' || target.superAdmin) {
      throw new ForbiddenException('Target account is outside your administrative scope.');
    }
    if (actor.role === 'admin') {
      const adminBranchIds = (admin.branchIds ?? []).map(String);
      if (adminBranchIds.length > 0 && (target.branchIds ?? []).map(String).some((id) => !adminBranchIds.includes(id))) {
        throw new ForbiddenException('Target staff member is outside your branch scope.');
      }
    }
    // Single-use temporary enrollment credential, returned exactly once.
    const temporaryPassword = randomBytes(18).toString('base64url');
    const passwordHash = await this.hashing.hashPassword(temporaryPassword);
    const updated = await this.users.findOneAndUpdate(
      { _id: target._id, tenantId: new Types.ObjectId(actor.tenantId), role: { $ne: Role.Owner }, superAdmin: { $ne: true } },
      {
        $set: { passwordHash, passwordRequiresChange: true, enrollmentExpiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS) },
        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
        $unset: { pinChallengeId: 1 },
      },
      { new: true },
    );
    if (!updated) throw new ForbiddenException('Target account is outside your administrative scope.');
    return {
      temporaryPassword,
      message: 'Share this one-time enrollment password with the staff member. They must set a new password at next sign-in, within 24 hours. Their previous sessions were revoked.',
    };
  }
}
