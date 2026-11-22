import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';

/**
 * Central password hashing.
 *
 * New passwords are always hashed with Argon2id. Existing bcrypt hashes remain
 * valid and are re-hashed (transparent upgrade) the next time the password is
 * verified successfully. PINs and OTP codes intentionally stay on bcrypt
 * because PIN search spaces are tiny and rate limiting is the real control;
 * this utility only manages login password hashes.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB, OWASP 2024 baseline
  timeCost: 2,
  parallelism: 1,
} satisfies Parameters<typeof argon2.hash>[1];

@Injectable()
export class PasswordHashingService {
  isArgon2(hash: string): boolean {
    return hash.startsWith('$argon2');
  }

  async hashPassword(password: string): Promise<string> {
    const result = await argon2.hash(password, ARGON2_OPTIONS);
    return typeof result === 'string' ? result : String(result);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (this.isArgon2(hash)) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    }
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  /** True when a legacy bcrypt hash was just verified and should be upgraded. */
  needsUpgrade(hash: string): boolean {
    return !this.isArgon2(hash);
  }
}
