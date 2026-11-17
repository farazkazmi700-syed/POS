# KazmiOn — Test Report

**Last verified:** 2026-11-17  
**Node.js version:** v24.15.0  
**TypeScript version:** 6.x

---

## API Unit Tests (Jest + ts-jest)

```
Test Suites:  14 passed, 14 total
Tests:        60 passed, 60 total
Snapshots:    0 total
Time:         ~12s
```

**Run command:**
```powershell
npm run test:api
# or
npm --prefix apps/api test
```

### Test Suites

| Suite | Tests | Status |
|-------|-------|--------|
| `auth.service.spec.ts` | ✓ | Passing |
| `product.service.spec.ts` | ✓ | Passing |
| `customer.service.spec.ts` | ✓ | Passing |
| `order.service.spec.ts` | ✓ | Passing |
| `installment.service.spec.ts` | ✓ | Passing |
| `invoice.service.spec.ts` | ✓ | Passing |
| `report.service.spec.ts` | ✓ | Passing |
| *(+ 7 controller / guard / module specs)* | ✓ | Passing |

### Key Fix Applied (invoice.service.spec.ts)

NestJS 12 ships as pure ESM. Jest CJS transform could not load `@nestjs/common`.  
**Fix:** `jest.mock()` all 4 NestJS packages before import, with schema stubs returning chainable `{plugin, index, pre, post}` objects.

---

## PDF Worker Tests (Node.js built-in test runner)

```
Tests:  6 passed, 6 total
Time:   ~3s
```

**Run command:**
```powershell
npm run test:pdf
# or
npm --prefix apps/pdf-worker test
# which runs: tsx --test src/services/invoice-renderer.test.ts src/services/paper.test.ts
```

| File | Tests | Status |
|------|-------|--------|
| `invoice-renderer.test.ts` | 4 | ✓ Passing |
| `paper.test.ts` | 2 | ✓ Passing |

---

## TypeScript Compilation (Type Checking)

| Package | Command | Status |
|---------|---------|--------|
| `apps/api` | `npm --prefix apps/api run build` | ✓ 0 errors |
| `apps/web` | `npm --prefix apps/web run typecheck` | ✓ 0 errors |
| `apps/pdf-worker` | `tsc -p apps/pdf-worker/tsconfig.json` | ✓ 0 errors |

**Run all type checks:**
```powershell
npm run test:web:typecheck
```

---

## Run All Tests

```powershell
npm run test:all
```

This runs:
1. `npm run test:api` — 60 Jest unit tests
2. `npm run test:pdf` — 6 Node.js PDF worker tests

---

## E2E Tests

> **Status:** Not yet implemented.  
> Planned: Playwright tests for critical user flows (login, POS checkout, installment payment, PDF generation).  
> See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for manual verification steps in the interim.

---

## Known Issues

None at time of last verification (2026-11-17).

---

## Jest Configuration (apps/api)

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

No `--experimental-vm-modules` needed. All NestJS ESM imports mocked at spec level.
