/** Payload sent through BullMQ to the pdf-worker. Keep in sync with app/pdf-worker/src/types.ts */
export interface InvoiceJobData {
  installment?: {
    cashPrice: number; downPayment: number; principal: number; financedAmount: number; charges: number; count: number; frequency: string;
    totalPayable: number; paidToDate: number; remaining: number; overdue: number; overdueCount: number;
    nextDue?: { dueDate: string; amount: number } | null;
    schedule: { no: number; dueDate: string; amount: number; paidAmount: number; status: string }[];
    /** Full buyer & guarantor snapshot captured at the sale (installment sales only). */
    customer?: { name: string; phone?: string; cnic?: string; address?: string };
    guarantor?: { name: string; phone?: string; cnic?: string; address?: string };
    agreementId?: string;
    status?: string;
    firstDueDate?: string;
    monthlyAmount?: number;
    markupPercent?: number;
    payments?: { receiptNo: string; amount: number; paidAt: string; mode: string; receivedBy: string; note?: string }[];
  };
  orderId: string;
  invoiceGeneration?: string;
  invoiceNo: string;
  createdAt: string; // ISO
  tenant: {
    id: string; name: string; address?: string; taxRegNo?: string; currency: string; logoUrl?: string;
    invoicePaperSize?: 'A4' | 'A5' | 'A6' | 'Receipt' | '80mm' | '58mm' | 'custom'; invoiceOrientation?: 'portrait' | 'landscape';
    domainType?: string; widthMm?: number; heightMm?: number; stamp?: string; watermark?: string; logoWatermark?: boolean; footerText?: string;
  };
  cashierName: string;
  customer?: { name?: string; phone?: string; cnic?: string; address?: string; guarantor?: { name?: string; phone?: string; cnic?: string; address?: string } };
  paymentMode: string;
  payments?: { mode: string; amount: number }[];
  items: {
    productId?: string; serialNo?: string;
    name: string; qty: number; unitPrice: number; discountPercent: number; discountAmount: number;
    taxPercent: number; taxAmount: number; lineTotal: number;
  }[];
  totals: {
    subtotal: number; discountTotal: number; taxableTotal: number; taxTotal: number;
    charges: { label: string; amount: number }[]; chargesTotal: number; grandTotal: number;
    taxBreakdown: { ratePercent: number; taxableAmount: number; taxAmount: number }[];
  };
}
