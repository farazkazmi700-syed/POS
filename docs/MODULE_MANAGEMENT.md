# KazmiOn — Module Management

## Overview

Modules are the unit of business functionality in KazmiOn. Each module corresponds to a business capability (inventory, POS, installments, reports, etc.) and can be enabled or disabled per tenant based on their subscription plan.

## Module Catalog

Modules are registered at **build time** in `packages/shared-types/src/module-manifests.ts`.

Each module definition:

```typescript
{
  id: 'MOD-PRODUCTS',          // Unique identifier — never change once deployed
  name: 'Products & Inventory',
  route: '/products',
  icon: 'package',
  roles: ['owner', 'admin', 'manager'],
  actions: ['create', 'read', 'update', 'delete'],
}
```

## Registered Modules

| ID | Name | Route |
|----|------|-------|
| `MOD-AUTH` | Authentication | `/auth` |
| `MOD-PRODUCTS` | Products & Inventory | `/products` |
| `MOD-CUSTOMERS` | Customer Management | `/customers` |
| `MOD-ORDERS` | POS / Sales | `/pos` |
| `MOD-INVOICES` | Invoice Generation | `/invoices` |
| `MOD-INSTALLMENTS` | Installment Sales | `/installments` |
| `MOD-REPORTS` | Business Reports | `/reports` |
| `MOD-SETTINGS` | Settings | `/settings` |
| `MOD-BACKUP` | Backup Management | `/backup` |
| `MOD-USERS` | User Management | `/users` |

## Navigation Source of Truth

`TENANT_NAVIGATION_ITEMS` in `packages/shared-types` drives:
- Sidebar navigation rendering
- Breadcrumb generation
- Route-to-module mapping for entitlement checks

**Single source of truth** — do not duplicate navigation logic in components.

## Adding a New Module

1. Add entry to `module-manifests.ts` with a new unique `MOD-*` ID
2. Add to `TENANT_NAVIGATION_ITEMS` in `packages/shared-types`
3. Create NestJS module: `apps/api/src/modules/<name>/`
   ```
   <name>.module.ts
   <name>.controller.ts    ← apply @ModuleRights('MOD-NAME')
   <name>.service.ts
   <name>.schema.ts
   <name>.dto.ts
   <name>.spec.ts
   ```
4. Register in `AppModule` imports
5. Add frontend route in `apps/web/src/App.tsx`
6. If paid: add to subscription plan definitions

## Guard Enforcement

`ModuleRightsGuard` enforces module access on every request:

1. Read `@ModuleRights('MOD-XXX')` decorator from controller/handler
2. Extract `tenantId` from JWT
3. Load tenant's active subscription plan (cached per request)
4. Check if `MOD-XXX` is included in the plan's module list
5. If not → `403 Forbidden`

> [!IMPORTANT]
> Module access is enforced at the **API layer**, not just the frontend. Hiding UI elements alone is insufficient.

## Subscription Plans

Plans are stored in MongoDB `subscriptionPlans` collection. Each plan specifies:
- Plan name and description
- List of included module IDs
- Price (for multi-tier commercial deployments)

Developer can:
- Create / modify plans via developer console
- Assign plan to any tenant
- Override individual module access per tenant

## Developer Console

The developer account has unrestricted access to all modules across all tenants. Developer-only endpoints are protected by `DeveloperScopeGuard`.
