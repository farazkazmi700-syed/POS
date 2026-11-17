# KazmiOn — API Documentation

## Interactive Docs (Swagger)

When running, full interactive API documentation is available at:

| Environment | Swagger URL |
|-------------|------------|
| Development (`npm run dev:api`) | http://localhost:3000/api/docs |
| Docker (port 3000 exposed for dev) | http://localhost:3000/api/docs |

The Swagger UI lets you explore every endpoint, view request/response schemas, and test calls directly from the browser with authentication.

## Base URL

| Environment | Base URL |
|-------------|---------|
| Development | `http://localhost:3000/api` |
| Docker (via Nginx proxy) | `http://localhost:8080/api` |
| Docker (direct to API) | `http://localhost:3000/api` |

## Authentication

All endpoints except public auth endpoints require a Bearer token:

```http
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/login`.

---

## Core Endpoints

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | Public | Login with email + password |
| `POST` | `/auth/refresh` | Public | Refresh access token using refresh token |
| `POST` | `/auth/logout` | ✓ | Invalidate current refresh token |
| `POST` | `/auth/change-password` | ✓ | Change own password |
| `POST` | `/auth/forgot-password` | Public | Send password reset email |
| `POST` | `/auth/reset-password` | Public | Reset password via email token |

### Products & Inventory

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/products` | All | List products (tenant-scoped, paginated) |
| `POST` | `/products` | owner, admin, manager | Create product |
| `GET` | `/products/:id` | All | Get product detail |
| `PUT` | `/products/:id` | owner, admin, manager | Update product |
| `DELETE` | `/products/:id` | owner, admin | Delete product |
| `POST` | `/products/:id/adjust-stock` | owner, admin, manager | Manual stock adjustment |
| `GET` | `/products/low-stock` | All | Products below reorder level |

### Customers

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/customers` | All | List customers (tenant-scoped) |
| `POST` | `/customers` | All | Create customer |
| `GET` | `/customers/:id` | All | Customer detail |
| `PUT` | `/customers/:id` | All | Update customer |
| `GET` | `/customers/:id/orders` | All | Customer order history |
| `GET` | `/customers/:id/installments` | All | Customer installment sales |

### Orders / POS

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/checkout` | All | Create sale / checkout |
| `GET` | `/orders` | All | List orders (paginated, filterable) |
| `GET` | `/orders/:id` | All | Order detail |
| `GET` | `/orders/:id/invoice` | All | Generate/retrieve invoice PDF URL |

### Installments

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/installment-products` | All | List installment products |
| `POST` | `/installment-products` | owner, admin, manager | Create installment product |
| `GET` | `/installment-plans` | All | List installment plans |
| `POST` | `/installment-plans` | owner, admin | Create plan |
| `POST` | `/installment-sales` | All | Create installment sale |
| `GET` | `/installment-sales` | All | List installment sales |
| `GET` | `/installment-sales/:id` | All | Sale detail + schedule |
| `POST` | `/installment-sales/:id/pay` | All | Record installment payment |
| `GET` | `/installment-sales/:id/receipt` | All | Generate installment receipt PDF |

### Reports

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/reports/sales` | owner, admin, manager | Sales summary (date range) |
| `GET` | `/reports/inventory` | owner, admin, manager | Inventory value report |
| `GET` | `/reports/customers` | owner, admin, manager | Customer analytics |
| `GET` | `/reports/installments` | owner, admin, manager | Installment summary |

### Users & Settings

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/users` | owner, admin | List staff users |
| `POST` | `/users` | owner, admin | Create staff user |
| `PUT` | `/users/:id` | owner, admin | Update staff user |
| `DELETE` | `/users/:id` | owner | Delete staff user |
| `GET` | `/settings` | owner, admin | Business settings |
| `PUT` | `/settings` | owner | Update settings |

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Validation error — check request body against schema |
| `401` | Unauthorized — missing or expired JWT |
| `403` | Forbidden — insufficient role or module access |
| `404` | Resource not found |
| `409` | Conflict — duplicate record (e.g. duplicate SKU) |
| `429` | Rate limit exceeded (100 req / 60s per IP) |
| `500` | Internal server error — check API logs |

---

## Pagination

Paginated endpoints accept query params:

```
GET /products?page=1&limit=20&search=laptop&sortBy=createdAt&order=desc
```

Response envelope:
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

## OpenAPI Spec

The raw OpenAPI spec is available at:
- `GET http://localhost:3000/api-json` — JSON format
- `docs/api-spec.yaml` — manually maintained YAML spec
