import type { Product } from '@pos/shared-types';
import { create } from 'zustand';

export interface CartItem {
  product: Product;
  qty: number;
  discountPercent: number;
  serialNo: string;
}

interface CartState {
  items: CartItem[];
  add: (product: Product) => void;
  setQty: (productId: string, qty: number) => void;
  setDiscount: (productId: string, percent: number) => void;
  setSerial: (productId: string, serialNo: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()((set) => ({
  items: [],
  add: (product) =>
    set((s) => {
      const existing = s.items.find((i) => i.product._id === product._id);
      if (existing) {
        return { items: s.items.map((i) => (i === existing ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return { items: [...s.items, { product, qty: 1, discountPercent: 0, serialNo: '' }] };
    }),
  setQty: (id, qty) =>
    set((s) => ({
      items: qty <= 0 ? s.items.filter((i) => i.product._id !== id) : s.items.map((i) => (i.product._id === id ? { ...i, qty } : i)),
    })),
  setDiscount: (id, percent) =>
    set((s) => ({
      items: s.items.map((i) => (i.product._id === id ? { ...i, discountPercent: Math.min(100, Math.max(0, percent)) } : i)),
    })),
  setSerial: (id, serialNo) =>
    set((s) => ({ items: s.items.map((i) => (i.product._id === id ? { ...i, serialNo } : i)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.product._id !== id) })),
  clear: () => set({ items: [] }),
}));
