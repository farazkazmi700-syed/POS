export interface InvoiceState { orderId: string; status: 'pending' | 'ready' | 'failed'; pdfPath?: string | null; }
export class PostgresInvoiceStore {
  constructor(connections: Record<string, string>);
  static fromFile(file: string): PostgresInvoiceStore;
  ready(): Promise<void>;
  seed(tenant: string, records: InvoiceState[]): Promise<void>;
  read(tenant: string, orderIds: string[]): Promise<InvoiceState[]>;
  begin(tenant: string, orderId: string): Promise<string>;
  finish(tenant: string, orderId: string, generation: string, status: 'ready' | 'failed', pdfPath?: string | null): Promise<boolean>;
  close(): Promise<void>;
}
