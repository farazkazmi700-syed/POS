import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomInt, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { EmailService } from './email.service';
import { User } from './schemas/user.schema';
import { ConfirmOtpDto, RecoveryConfirmDto, RecoveryRequestDto } from './recovery.dto';

@Schema()
export class RecoveryChallenge {
  @Prop({ required: true, unique: true }) challengeId: string;
  @Prop({ required: true, type: Types.ObjectId }) userId: Types.ObjectId;
  @Prop({ required: true }) purpose: string;
  @Prop({ required: true }) channel: string;
  @Prop({ required: true }) destination: string;
  @Prop({ required: true, select: false }) codeHash: string;
  @Prop({ required: true, expires: 0 }) expiresAt: Date;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ required: true }) sessionVersion: number;
  @Prop({ required: true }) developerSessionVersion: number;
}
export const RecoveryChallengeSchema = SchemaFactory.createForClass(RecoveryChallenge);

@Injectable()
export class RecoveryService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(RecoveryChallenge.name) private readonly challenges: Model<RecoveryChallenge>, private readonly config: ConfigService, private readonly email: EmailService) {}
  options() { return { email: this.email.isConfigured(), whatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_CONTENT_SID'].every((key) => !!this.config.get<string>(key)) }; }
  private destination(user: User, channel: string) {
    return channel === 'whatsapp' ? user.phoneVerified && user.phoneVerifiedAt ? user.phone : null : user.emailVerified && user.emailVerifiedAt && user.recoveryEmail ? user.recoveryEmail : user.email;
  }
  private async deliver(channel: string, destination: string, code: string, purpose: string) {
    if (channel === 'email') return this.email.sendSecurityCode(destination, code, purpose === 'password' ? 'password reset' : 'PIN reset');
    const account = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${Buffer.from(`${account}:${this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: `whatsapp:${this.config.getOrThrow<string>('TWILIO_WHATSAPP_FROM')}`, To: `whatsapp:${destination}`, ContentSid: this.config.getOrThrow<string>('TWILIO_WHATSAPP_CONTENT_SID'), ContentVariables: JSON.stringify({ '1': code }) }),
      });
      const result = await response.json() as { sid?: string; status?: string };
      if (!response.ok || !result.sid || ['failed', 'undelivered'].includes(result.status ?? '')) throw new Error('Provider rejected the message');
    } catch { throw new ServiceUnavailableException('WhatsApp could not accept the code. Try again later or use email.'); }
  }
  async request(dto: RecoveryRequestDto) {
    const channel = dto.channel ?? 'email';
    if (!this.options()[channel]) throw new ServiceUnavailableException(`${channel === 'email' ? 'Email' : 'WhatsApp'} OTP delivery is not configured. Contact your administrator.`);
    const user = await this.users.findOne({ email: dto.email.trim().toLowerCase(), isActive: true }).select('+developerPinHash +developerSessionVersion');
    const destination = user ? this.destination(user, channel) : null;
    const eligible = user && destination && (dto.purpose !== 'developer-pin' || !!user.developerPinHash && user.email === this.config.get<string>('PLATFORM_DEVELOPER_EMAIL')?.trim().toLowerCase());
    if (!eligible) {
      await bcrypt.hash(String(randomInt(100000, 1000000)), 10);
      return this.response(randomUUID());
    }
    return this.issue(user, dto.purpose, channel, destination);
  }
  async requestPhone(userId: string, phone?: string) {
    if (!this.options().whatsapp) throw new ServiceUnavailableException('WhatsApp OTP delivery is not configured.');
    const user = await this.users.findOne({ _id: userId, isActive: true }).select('+developerSessionVersion');
    if (!user) throw new BadRequestException('Account unavailable.');
    const destination = phone ?? user.phone;
    if (!destination || !/^\+[1-9]\d{7,14}$/.test(destination)) throw new BadRequestException('Use an international WhatsApp number, for example +923001234567.');
    return this.issue(user, 'phone-verification', 'whatsapp', destination);
  }
  private response(challengeId: string) { return { challengeId, expiresIn: 600, resendAfter: 60, message: 'If this account is eligible, a code will arrive at its registered contact. Check your inbox or WhatsApp. The code expires in 10 minutes.' }; }
  private versions(challenge: RecoveryChallenge) {
    return { $and: [
      { $or: [{ sessionVersion: challenge.sessionVersion }, ...(challenge.sessionVersion === 0 ? [{ sessionVersion: { $exists: false } }] : [])] },
      { $or: [{ developerSessionVersion: challenge.developerSessionVersion }, ...(challenge.developerSessionVersion === 0 ? [{ developerSessionVersion: { $exists: false } }] : [])] },
    ] };
  }
  private async issue(user: User & { _id: Types.ObjectId }, purpose: string, channel: string, destination: string) {
    const now = new Date();
    const reserved = await this.users.findOneAndUpdate({ _id: user._id, $or: [{ securityCodeRequestedAt: null }, { securityCodeRequestedAt: { $lte: new Date(Date.now() - 60000) } }] }, { $set: { securityCodeRequestedAt: now } });
    if (!reserved) return this.response(randomUUID());
    const challengeId = randomUUID(); const code = String(randomInt(100000, 1000000));
    await this.challenges.deleteMany({ userId: user._id });
    await this.challenges.create({ challengeId, userId: user._id, purpose, channel, destination, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 600000), sessionVersion: user.sessionVersion ?? 0, developerSessionVersion: user.developerSessionVersion ?? 0 });
    try { await this.deliver(channel, destination, code, purpose); }
    catch { await this.challenges.deleteOne({ challengeId }); throw new ServiceUnavailableException('The code could not be sent. Try again later or choose another available channel.'); }
    return this.response(challengeId);
  }
  private async validate(dto: ConfirmOtpDto, phoneUserId?: string) {
    const challenge = await this.challenges.findOneAndUpdate({ challengeId: dto.challengeId, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(phoneUserId ? { userId: new Types.ObjectId(phoneUserId), purpose: 'phone-verification' } : { purpose: { $ne: 'phone-verification' } }) }, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash');
    if (!challenge || !await bcrypt.compare(dto.code, challenge.codeHash)) throw new BadRequestException('Invalid or expired code. Request a new code if needed.');
    const user = await this.users.findOne({ _id: challenge.userId, isActive: true }).select('+developerSessionVersion');
    if (!user || (user.sessionVersion ?? 0) !== challenge.sessionVersion || (user.developerSessionVersion ?? 0) !== challenge.developerSessionVersion || !phoneUserId && this.destination(user, challenge.channel) !== challenge.destination) throw new BadRequestException('Account or recovery contact changed. Request a new code.');
    return { challenge, user };
  }
  async confirm(dto: RecoveryConfirmDto) {
    const { challenge, user } = await this.validate(dto);
    const secret = dto.newSecret;
    if (challenge.purpose === 'password' ? secret.length < 8 || Buffer.byteLength(secret, 'utf8') > 72 : !new RegExp(`^\\d{${challenge.purpose === 'developer-pin' ? 8 : 4}}$`).test(secret) || /^0+$/.test(secret)) throw new BadRequestException(challenge.purpose === 'password' ? 'Use a password of 8–72 bytes.' : 'Enter a private PIN of the required length; all-zero PINs are not allowed.');
    const hash = await bcrypt.hash(secret, 12);
    const claimed = await this.challenges.deleteOne({ _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lte: 5 }, expiresAt: { $gt: new Date() } });
    if (!claimed.deletedCount) throw new BadRequestException('This code has expired or has already been used.');
    const field = challenge.purpose === 'password' ? 'passwordHash' : challenge.purpose === 'developer-pin' ? 'developerPinHash' : 'pinHash';
    const updated = await this.users.updateOne({ _id: user._id, isActive: true, ...this.versions(challenge), email: user.email, recoveryEmail: user.recoveryEmail ?? null, phone: user.phone ?? null, emailVerifiedAt: user.emailVerifiedAt ?? null, phoneVerifiedAt: user.phoneVerifiedAt ?? null }, { $set: { [field]: hash, pinFailedAttempts: 0, pinLockedUntil: null, ...(field === 'pinHash' ? { pinRequiresChange: false, pinEnabled: true } : {}) }, $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 }, $unset: { pinChallengeId: 1, pinResetCodeHash: 1, pinResetExpiresAt: 1, emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } });
    if (!updated.modifiedCount) throw new BadRequestException('Account changed. Request a new code.');
    await this.challenges.deleteMany({ userId: user._id });
    return { message: 'Updated successfully. All sessions have been signed out. Sign in with your new credentials.' };
  }
  async confirmLegacyPin(email: string, code: string, newPin: string) {
    const user = await this.users.findOne({ email: email.trim().toLowerCase(), isActive: true });
    const challenge = user ? await this.challenges.findOne({ userId: user._id, purpose: 'pin', expiresAt: { $gt: new Date() } }) : null;
    if (!challenge) throw new BadRequestException('Invalid or expired code. Request a new code if needed.');
    return this.confirm({ challengeId: challenge.challengeId, code, newSecret: newPin });
  }
  async confirmPhone(userId: string, dto: ConfirmOtpDto) {
    const { challenge } = await this.validate(dto, userId);
    const claimed = await this.challenges.deleteOne({ _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lte: 5 }, expiresAt: { $gt: new Date() } });
    if (!claimed.deletedCount) throw new BadRequestException('This code has expired or has already been used.');
    const updated = await this.users.updateOne({ _id: userId, isActive: true, ...this.versions(challenge) }, { $set: { phone: challenge.destination, phoneVerified: true, phoneVerifiedAt: new Date() } });
    if (!updated.matchedCount) throw new BadRequestException('Account changed. Try again.');
    return { message: 'WhatsApp number verified for account recovery.' };
  }
}
