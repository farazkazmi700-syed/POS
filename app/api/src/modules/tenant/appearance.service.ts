import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresInvoiceStore } from '@pos/invoice-store';
import { IsIn, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class AppearanceDto {
  @IsIn([
    'minimal', 'modern', 'enterprise', 'premium', 'compact',
    'glassmorphism', 'skeuomorphism', 'neo-brutalism', 'claymorphism', 'liquid-glass',
  ])
  preset: string;

  @IsIn(['light', 'dark', 'system'])
  mode: string;

  @IsIn(['preset', 'surface'])
  sidebar: string;

  @IsIn(['comfortable', 'compact'])
  dashboardDensity: string;

  @IsIn(['comfortable', 'compact'])
  tableDensity: string;

  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9a-f]{6}$/i)
  primary: string | null;

  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9a-f]{6}$/i)
  secondary: string | null;

  @IsString()
  @MaxLength(65_536)
  @Matches(/^(?:data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})?$/)
  logo: string;
}

const defaults: AppearanceDto = {
  preset: 'minimal', mode: 'system', sidebar: 'preset',
  dashboardDensity: 'comfortable', tableDensity: 'comfortable', primary: null, secondary: null, logo: '',
};

@Injectable()
export class AppearanceService implements OnModuleDestroy {
  private readonly store?: PostgresInvoiceStore;

  constructor(config: ConfigService) {
    const directory = config.get<string>('BUSINESS_DB_DIRECTORY');
    const registry = config.get<string>('INVOICE_DATABASES_FILE');
    if (directory) this.store = PostgresInvoiceStore.fromDirectory(directory);
    else if (registry) this.store = PostgresInvoiceStore.fromFile(registry);
  }

  async read(tenant: string) {
    if (!this.store) return defaults;
    try {
      return await this.store.readAppearance(tenant) ?? defaults;
    } catch {
      throw new ServiceUnavailableException('Business appearance database unavailable');
    }
  }

  async write(tenant: string, appearance: AppearanceDto) {
    if (!this.store) throw new ServiceUnavailableException('PostgreSQL is required to save business appearance');
    try {
      return await this.store.writeAppearance(tenant, appearance);
    } catch {
      throw new ServiceUnavailableException('Business appearance database unavailable');
    }
  }

  async onModuleDestroy() {
    await this.store?.close();
  }
}
