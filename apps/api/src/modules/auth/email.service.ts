import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].every((key) => !!this.config.get<string>(key));
  }

  async sendSecurityCode(to: string, code: string, purpose: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM') || user;
    if (!host || !user || !password || !from) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: { user, pass: password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    try {
      const result = await transporter.sendMail({
        from,
        to,
        subject: `POS ${purpose} code`,
        text: `Your POS ${purpose} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      });
      if (!result.accepted?.length) throw new ServiceUnavailableException('Email delivery was not accepted.');
    } finally {
      transporter.close();
    }
  }

  /** Sends a password-reset link. The URL is prebuilt from a trusted configured base; the token is never logged. */
  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM') || user;
    if (!host || !user || !password || !from) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: { user, pass: password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    try {
      const result = await transporter.sendMail({
        from,
        to,
        subject: 'POS password reset link',
        text: `A password reset was requested for your POS account. Open this link within 15 minutes to choose a new password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email and your password stays unchanged.`,
      });
      if (!result.accepted?.length) throw new ServiceUnavailableException('Email delivery was not accepted.');
    } finally {
      transporter.close();
    }
  }
}
