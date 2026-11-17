# KazmiOn — Authentication & Security

## Authentication Flow

```
Client                       API
  │                           │
  ├─ POST /auth/login ────────►│
  │   { email, password }     │  1. Load user by email
  │                           │  2. Verify password hash (Argon2id or bcrypt)
  │                           │  3. If bcrypt → upgrade to Argon2id silently
  │◄─ { access_token,         │  4. Issue JWT pair
  │     refresh_token } ──────┤
  │                           │
  ├─ GET /api/... ────────────►│
  │  Authorization: Bearer    │  5. JwtAuthGuard extracts user from JWT
  │  <access_token>           │  6. Guard stack runs (see below)
  │◄─ response ───────────────┤
  │                           │
  ├─ POST /auth/refresh ──────►│
  │   { refresh_token }       │  7. Validate refresh token
  │◄─ { access_token } ───────┤  8. Issue new access token
```

## Password Hashing

| Algorithm | Usage | Config |
|-----------|-------|--------|
| **Argon2id** | All new passwords and password changes | Default for all new users |
| **bcrypt** | Legacy (transparent upgrade on login) | Detected by hash prefix `$2b$` |

On login: if bcrypt hash detected → verify with bcrypt → re-hash to Argon2id → save new hash. User never notices.

## JWT Tokens

| Token | Default TTL | Env var |
|-------|------------|---------|
| Access token | 15 minutes | `JWT_ACCESS_TTL` |
| Refresh token | 7 days | `JWT_REFRESH_TTL` |

**Secrets:**
- `JWT_ACCESS_SECRET` — signs access tokens
- `JWT_REFRESH_SECRET` — signs refresh tokens (must be **different** from access secret)
- Minimum 32 characters, 64 recommended
- Never commit real values to source control

## Guard Stack (Execution Order)

| Guard | Purpose |
|-------|---------|
| `JwtAuthGuard` | Verify JWT, extract user identity |
| `AppThrottlerGuard` | Rate limiting (100 req/60s per IP) |
| `DeveloperScopeGuard` | Block non-developer access to developer endpoints |
| `TenantStatusGuard` | Verify tenant is `active` (not suspended/deleted) |
| `BranchGuard` | Scope to specific branch if applicable |
| `RolesGuard` | Check user role against endpoint's `@Roles()` decorator |
| `ActionPermissionsGuard` | Fine-grained action permissions (create/read/update/delete) |
| `ModuleRightsGuard` | Check tenant subscription includes the module |
| `FeatureGuard` | Feature flag gating |

## Role Hierarchy

| Role | Scope | Typical Capabilities |
|------|-------|---------------------|
| `developer` | Platform-wide | All tenants, all modules, developer console |
| `owner` | Own tenant | All business operations, all modules |
| `admin` | Own tenant | User management, settings, reports |
| `manager` | Own tenant | Product management, reports, no user management |
| `cashier` | Own tenant | POS sales only |

## Tenant Isolation in Auth

- `tenantId` is embedded in the JWT payload at login
- `TenantStatusGuard` validates the tenant is active on every request
- Services receive `tenantId` from the validated JWT — never from the request body
- Cross-tenant access is architecturally impossible through normal API paths

## Sensitive Environment Variables

> [!CAUTION]
> Never commit these to source control. Always use `.env` (gitignored) or Docker environment injection.

```
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
PLATFORM_DEVELOPER_SETUP_TOKEN
DEV_ACCOUNT_PASSWORD_HASH
SMTP_PASSWORD
BACKUP_DRIVE_CLIENT_SECRET
BACKUP_DRIVE_REFRESH_TOKEN
TWILIO_AUTH_TOKEN
POSTGRES_PASSWORD
```

## Security Headers (Nginx Production)

The production Nginx config includes:
```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
```

## Developer Setup Token

The `PLATFORM_DEVELOPER_SETUP_TOKEN` is a one-time token used to provision the developer account via the setup endpoint. After setup is complete:
- Change or invalidate the token
- The endpoint should return 410 Gone if already used
