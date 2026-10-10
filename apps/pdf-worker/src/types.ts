/** Payload produced by the API (apps/api/src/modules/invoice/invoice-job.types.ts). Keep in sync. */
export interface InvoiceJobData {
  orderId: string;
  invoiceNo: string;
  createdAt: string;
  tenant: { id: string; name: string; address?: string; taxRegNo?: string; currency: string; logoUrl?: string };
  cashierName: string;
  customer?: { name?: string; phone?: string };
  paymentMode: string;
  items: {
    name: string; qty: number; unitPrice: number; discountPercent: number; discountAmount: number;
    taxPercent: number; taxAmount: number; lineTotal: number;
  }[];
  totals: {
    subtotal: number; discountTotal: number; taxableTotal: number; taxTotal: number;
    charges: { label: string; amount: number }[]; chargesTotal: number; grandTotal: number;
    taxBreakdown: { ratePercent: number; taxableAmount: number; taxAmount: number }[];
  };
}
