import { PayloadTooLargeException } from '@nestjs/common';
import { Workbook } from 'exceljs';

const preferredColumns: Record<string, string[]> = {
  products: ['_id', 'tenantId', 'branchId', 'name', 'sku', 'barcode', 'price', 'costPrice', 'stockQty'],
  customers: ['_id', 'tenantId', 'branchId', 'name', 'phone', 'email', 'address'],
  orders: ['_id', 'tenantId', 'branchId', 'invoiceNo', 'createdAt', 'customerId', 'paymentMode', 'status', 'grandTotal', 'items'],
  invoicecounters: ['_id', 'tenantId', 'year', 'lastNumber'],
  installmentplans: ['_id', 'tenantId', 'orderId', 'invoiceNo', 'customerId', 'customerName', 'totalPayable', 'paidTotal', 'balance', 'status', 'schedule', 'payments'],
};

const CELL_LIMIT = 32_767;

function label(key: string) {
  if (key === '_id') return 'Record ID';
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function backupWorkbook(name: string, records: Record<string, unknown>[]) {
  const workbook = new Workbook();
  workbook.creator = 'KazmiOn POS';
  const sheet = workbook.addWorksheet('Records', { views: [{ state: 'frozen', ySplit: 1 }] });
  const fields = new Set(preferredColumns[name] ?? ['_id', 'tenantId']);
  for (const record of records) for (const key of Object.keys(record)) fields.add(key);
  const keys = [...fields];
  if (keys.length > 16_384) throw new PayloadTooLargeException('The collection exceeds the Excel column limit.');
  sheet.columns = keys.map((key) => ({ header: label(key), width: Math.max(16, Math.min(42, label(key).length + 6)) }));
  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163457' } };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
  let overflow: ReturnType<Workbook['addWorksheet']> | undefined;

  for (const record of records) {
    const row = sheet.addRow([]);
    let column = 1;
    for (const key of keys) {
      const value = Object.hasOwn(record, key) ? record[key] : undefined;
      const cell = row.getCell(column++);
      if (typeof value === 'number' && Math.abs(value) < 1e15) {
        cell.value = value;
        if (/(?:price|total|balance|amount|cost|tax|discount)$/i.test(key)) cell.numFmt = '#,##0.00';
      } else if (typeof value === 'boolean') {
        cell.value = value;
      } else if (typeof value === 'string' && /(?:At|Date)$/.test(key) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
        cell.value = new Date(value);
        cell.numFmt = 'yyyy-mm-dd hh:mm:ss.000" UTC"';
      } else if (value !== undefined) {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (text.length <= CELL_LIMIT) {
          cell.value = text;
        } else {
          if (!overflow) {
            overflow = workbook.addWorksheet('Long Values', { views: [{ state: 'frozen', ySplit: 1 }] });
            overflow.columns = [
              { header: 'Record Row', width: 14 }, { header: 'Field Key', width: 25 },
              { header: 'Part', width: 10 }, { header: 'Value', width: 60 },
            ];
            overflow.getRow(1).font = { bold: true };
          }
          let buffer = '';
          let part = 1;
          for (const character of text) {
            if (buffer.length + character.length > CELL_LIMIT) {
              overflow.addRow([row.number, key, part++, buffer]);
              buffer = '';
            }
            buffer += character;
          }
          if (buffer) overflow.addRow([row.number, key, part, buffer]);
          cell.value = 'See Long Values';
        }
      }
    }
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
