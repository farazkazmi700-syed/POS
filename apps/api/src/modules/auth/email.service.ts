import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async sendSecurityCode(to: string, code: string, purpose: 'email verification' | 'PIN reset'): Promise<void> {
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
    });
    try {
      await transporter.sendMail({
        from,
        to,
        subject: `POS ${purpose} code`,
        text: `Your POS ${purpose} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      });
    } finally {
      transporter.close();
    }
  }
}