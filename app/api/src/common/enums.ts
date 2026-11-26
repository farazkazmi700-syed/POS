export enum Role { Owner = 'owner', Admin = 'admin', Cashier = 'cashier' }
export enum DomainType { Retail = 'retail', Restaurant = 'restaurant', Pharmacy = 'pharmacy', Supermarket = 'supermarket', Grocery = 'grocery', Electronics = 'electronics', Salon = 'salon', Custom = 'custom',
  MotorcycleDealer = 'motorcycle-dealer', ElectricBikeDealer = 'electric-bike-dealer', MobileShop = 'mobile-shop', FurnitureStore = 'furniture-store',
  HomeAppliances = 'home-appliances', SolarEquipment = 'solar-equipment', CarDealership = 'car-dealership', AgriculturalMachinery = 'agricultural-machinery',
}
export enum TaxClass { Standard = 'standard', Reduced = 'reduced', Exempt = 'exempt' }
export enum PaymentMode { Cash = 'cash', Card = 'card', Wallet = 'wallet', Installment = 'installment', Mixed = 'mixed' }
export enum PlanStatus { Active = 'active', Completed = 'completed' }
export enum OrderStatus { Completed = 'completed', Voided = 'voided', Refunded = 'refunded' }
export enum InvoiceStatus { Pending = 'pending', Ready = 'ready', Failed = 'failed' }
export enum ChargeType { Flat = 'flat', Percent = 'percent' }
export enum InvoicePaperSize { A4 = 'A4', A5 = 'A5', A6 = 'A6', Receipt = 'Receipt', Thermal80 = '80mm', Thermal58 = '58mm', Custom = 'custom' }
