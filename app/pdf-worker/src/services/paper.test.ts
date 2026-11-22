import assert from 'node:assert/strict';
import { it } from 'node:test';
import { invoicePaper } from './paper';
it('uses physical paper dimensions including legacy Receipt alias', () => {
  for (const [size, width, height] of [['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['80mm', 80, 200], ['58mm', 58, 200], ['Receipt', 80, 200]] as const) {
    const paper = invoicePaper({ id: 't', name: 'test', currency: 'PKR', invoicePaperSize: size });
    assert.equal(paper.width, width); assert.equal(paper.height, height);
  }
});
it('validates custom dimensions and rotates sheet orientation', () => {
  const tenant = { id: 't', name: 'test', currency: 'PKR', invoicePaperSize: 'custom' as const, widthMm: 120, heightMm: 180 };
  assert.deepEqual(invoicePaper({ ...tenant, invoiceOrientation: 'landscape' }), { width: 180, height: 120, margin: 10, compact: false });
  for (const widthMm of [0, 421, NaN, Infinity]) assert.throws(() => invoicePaper({ ...tenant, widthMm }));
});
