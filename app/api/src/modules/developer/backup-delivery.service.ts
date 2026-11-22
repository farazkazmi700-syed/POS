import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { strToU8, zip } from 'fflate';
import nodemailer from 'nodemailer';
import { IsIn } from 'class-validator';
import { SuperAdminService } from '../super-admin/super-admin.service';

export class BackupDeliveryDto { @IsIn(['email', 'drive']) destination: 'email' | 'drive'; }

@Injectable()
export class BackupDeliveryService {
  private busy = false;
  constructor(private readonly config: ConfigService, private readonly platform: SuperAdminService) {}
  private configured(keys: string[]) { return keys.every(key => !!this.config.get<string>(key)); }
  options() {
    const cloud = this.config.get('BACKUP_MODE', 'offline') === 'cloud';
    return {
      mode: cloud ? 'cloud' : 'offline',
      email: cloud && this.configured(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'BACKUP_EMAIL_TO']),
      drive: cloud && this.configured(['BACKUP_DRIVE_CLIENT_ID', 'BACKUP_DRIVE_CLIENT_SECRET', 'BACKUP_DRIVE_REFRESH_TOKEN', 'BACKUP_DRIVE_FOLDER_ID']),
      emailTo: cloud ? this.config.get<string>('BACKUP_EMAIL_TO') : undefined,
    };
  }
  async deliver(destination: 'email' | 'drive') {
    if (!this.options()[destination]) throw new BadRequestException('This backup destination is unavailable. Configure cloud mode and delivery credentials, or download ZIP.');
    if (this.busy) throw new ConflictException('A backup delivery is already running.');
    this.busy = true;
    try {
      const snapshot = await this.platform.createBackup();
      const files: Record<string, Uint8Array> = {};
      for (const [name, value] of Object.entries(snapshot)) files[`${name}.json`] = strToU8(JSON.stringify(value, null, 2));
      files['manifest.json'] = strToU8(JSON.stringify({ formatVersion: 1, files: Object.entries(files).map(([name, data]) => ({ name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })) }, null, 2));
      const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
      const name = `kazmion-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.zip`;
      if (data.length > (destination === 'drive' ? 5 : 15) * 1024 * 1024) throw new BadRequestException('ZIP exceeds the direct delivery size limit. Download ZIP and upload manually.');
      if (destination === 'email') {
        const transport = nodemailer.createTransport({ host: this.config.get<string>('SMTP_HOST'), port: Number(this.config.get('SMTP_PORT', '587')), secure: this.config.get('SMTP_SECURE', 'false') === 'true', requireTLS: true,
          auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 60000 });
        try {
          const result = await transport.sendMail({ from: this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER'), to: this.config.get<string>('BACKUP_EMAIL_TO'), subject: 'POS backup ZIP', text: 'Attached is a sanitized logical export. Retain native database and uploaded-file backups separately.', attachments: [{ filename: name, content: Buffer.from(data), contentType: 'application/zip' }] });
          if (!result.accepted?.length) throw new Error('Not accepted');
          return { destination, status: 'accepted', filename: name };
        } finally { transport.close(); }
      }
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), body: new URLSearchParams({ grant_type: 'refresh_token', client_id: this.config.get<string>('BACKUP_DRIVE_CLIENT_ID')!, client_secret: this.config.get<string>('BACKUP_DRIVE_CLIENT_SECRET')!, refresh_token: this.config.get<string>('BACKUP_DRIVE_REFRESH_TOKEN')! }) });
      if (!tokenResponse.ok) throw new Error('Drive authentication failed');
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error('Missing token');
      const boundary = randomUUID();
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [this.config.get<string>('BACKUP_DRIVE_FOLDER_ID')] })}\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`), Buffer.from(data), Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      if (!response.ok) throw new Error('Drive upload failed');
      const file = await response.json() as { id?: string };
      if (!file.id) throw new Error('Missing file ID');
      return { destination, status: 'uploaded', filename: name, fileId: file.id };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('Delivery could not be confirmed. Check the destination before retrying, or download ZIP.');
    } finally { this.busy = false; }
  }
}
