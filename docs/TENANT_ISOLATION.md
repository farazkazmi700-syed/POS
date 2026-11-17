# KazmiOn — Tenant Isolation

## Isolation Model

KazmiOn uses **shared-database, shared-collection** multi-tenancy with strict `tenantId` filtering enforced at the service layer.

Every MongoDB document in business collections includes a `tenantId` field (ObjectId). Every service method includes `tenantId` on **every query** — there are no collection-level scans.

## Verified Isolation Points

Audited 2026-11-17 — all services confirmed clean:

| Service | File | Isolation method |
|---------|------|-----------------|
| `CustomerService` | `customer.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `ProductService` | `product.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `ReportService` | `report.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `OrderService` | `order.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `AuthService` | `auth.service.ts` | Per-tenant user lookup |
| `InstallmentService` | `installment.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `InvoiceService` | `invoice.service.ts` | `tenantId: oid(tenantId)` on all queries |

## How Tenant ID Flows

```
JWT (login)
  → TenantStatusGuard extracts tenantId from token payload
  → Validates tenant.status === 'active'
  → Attaches tenantId to request object
    → Controller reads from request (not from body!)
      → Service receives tenantId as parameter
        → Every DB query includes { tenantId: oid(tenantId) }
```

> [!IMPORTANT]
> Services never trust `tenantId` from the request body. It always comes from the validated JWT payload via the guard chain.

## ObjectId Conversion

The `oid()` utility converts the string `tenantId` from the JWT payload into a MongoDB ObjectId:

```typescript
import { Types } from 'mongoose';

function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
```

Using string comparison instead of ObjectId would silently return empty results (no match), not leak data — but the correct ObjectId conversion is verified on all services.

## Guard Chain Protection

```
JwtAuthGuard          ← validates token signature + expiry
  TenantStatusGuard   ← loads tenant, checks active status
    BranchGuard       ← scopes to branch within tenant
      RolesGuard      ← checks user role
        ModuleRightsGuard ← checks module subscription
```

A suspended or deleted tenant cannot pass `TenantStatusGuard`, so no business logic runs for inactive tenants.

## Recommended MongoDB Indexes

For performance with multi-tenant collections at scale:

```javascript
// products
db.products.createIndex({ tenantId: 1, sku: 1 }, { unique: true })
db.products.createIndex({ tenantId: 1, createdAt: -1 })

// orders
db.orders.createIndex({ tenantId: 1, createdAt: -1 })
db.orders.createIndex({ tenantId: 1, invoiceNo: 1 })

// customers
db.customers.createIndex({ tenantId: 1, phone: 1 })

// installmentSales
db.installmentSales.createIndex({ tenantId: 1, status: 1 })
db.installmentSales.createIndex({ tenantId: 1, customerId: 1 })
```

## Cross-Business Isolation (Multiple Businesses)

If multiple businesses share a single installation:
- Each business is a separate **tenant** with its own `tenantId`
- All data is scoped by `tenantId` — no shared collections without tenant scoping
- Users are assigned to exactly one tenant
- The JWT contains the user's `tenantId` — they cannot switch tenants without a fresh login

## Security Boundaries

| Boundary | Enforced by |
|----------|------------|
| Token validity | `JwtAuthGuard` |
| Tenant active | `TenantStatusGuard` |
| Role access | `RolesGuard` |
| Module access | `ModuleRightsGuard` |
| Data isolation | `tenantId` on every MongoDB query |
| Developer isolation | `DeveloperScopeGuard` |
