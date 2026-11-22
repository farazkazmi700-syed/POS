import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].every((key) => !!this.config.get<string>(key));
  }

  private from(): string {
    return this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER') || '';
  }

  private transporter() {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.from();
    if (!host || !user || !password || !from) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }
    return nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: { user, pass: password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
  }

  /** Sends a single email through the configured SMTP transport. */
  private async sendMail(options: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    const transporter = this.transporter();
    try {
      const result = await transporter.sendMail({
        from: this.from(),
        ...options,
      });
      if (!result.accepted?.length) throw new ServiceUnavailableException('Email delivery was not accepted.');
    } finally {
      transporter.close();
    }
  }

  async sendSecurityCode(to: string, code: string, purpose: string): Promise<void> {
    await this.sendMail({
      to,
      subject: `POS ${purpose} code`,
      text: `Your POS ${purpose} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    });
  }

  /** Sends a password-reset link. The URL is prebuilt from a trusted configured base; the token is never logged. */
  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Reset your POS password',
      text: `A password reset was requested for your POS account. Open this link within 15 minutes to choose a new password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email and your password stays unchanged.`,
      html: `
        <h2>Reset your POS password</h2>
        <p>A password reset was requested for your POS account.</p>
        <p>Open the link below within 15 minutes to choose a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, ignore this email and your password stays unchanged.</p>
      `,
    });
  }
}
