import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresInvoiceStore } from '@pos/invoice-store';
import { InvoiceStatus } from '../../common/enums';
import { OrderDocument } from '../order/schemas/order.schema';

@Injectable()
export class InvoiceStateService implements OnModuleDestroy, OnModuleInit {
  readonly postgres?: PostgresInvoiceStore;
  constructor(config: ConfigService) {
    const directory = config.get<string>('BUSINESS_DB_DIRECTORY');
    if (directory) { this.postgres = PostgresInvoiceStore.fromDirectory(directory); return; }
    const registry = config.get<string>('INVOICE_DATABASES_FILE');
    const mode = config.get<string>('INVOICE_STORE') || (registry ? 'postgres' : 'mongodb');
    if (!['postgres', 'mongodb'].includes(mode)) throw new Error('Invalid INVOICE_STORE');
    if (mode === 'postgres') this.postgres = PostgresInvoiceStore.fromFile(registry || '');
  }
  async hydrate(tenantId: string, orders: OrderDocument[]): Promise<void> {
    if (!this.postgres || !orders.length) return;
    try {
      // Seed only absent rows; PostgreSQL state always wins once a row exists.
      const states = new Map((await this.postgres.read(tenantId, orders.map(order => order.id))).map(state => [state.orderId, state]));
      const missing = orders.filter(order => !states.has(order.id));
      if (missing.length) {
        await this.postgres.seed(tenantId, missing.map(order => ({ orderId: order.id, status: order.invoiceStatus, pdfPath: order.invoicePdfPath })));
        for (const state of await this.postgres.read(tenantId, missing.map(order => order.id))) states.set(state.orderId, state);
      }
      for (const order of orders) {
        const state = states.get(order.id);
        if (!state) throw new Error('Missing PostgreSQL invoice');
        order.invoiceStatus = state.status as InvoiceStatus;
        order.invoicePdfPath = state.pdfPath ?? undefined;
      }
    } catch { throw new ServiceUnavailableException('Invoice database unavailable'); }
  }
  async onModuleDestroy() { await this.postgres?.close(); }
  async onModuleInit() { await this.postgres?.ready(); }
}
