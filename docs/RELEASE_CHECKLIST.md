# KazmiOn — Release Checklist

Use this checklist before every deployment or update.

---

## 1. Code Quality

- [ ] `npm run test:all` passes — 60/60 API tests, 6/6 PDF tests
- [ ] `npm run test:web:typecheck` passes — 0 TypeScript errors
- [ ] `npm --prefix apps/api run build` succeeds
- [ ] No secrets or credentials committed to git (`git log --all -p | grep -i password`)
- [ ] `.env.example` updated for any new environment variables

---

## 2. Docker Build & Health

- [ ] `npm run docker:rebuild` completes without error
- [ ] `.\scripts\verify-deployment.ps1` — all checks pass
- [ ] `GET http://localhost:3000/api/health` → `{"status":"ok"}`
- [ ] `http://localhost:8080` → login page renders
- [ ] All containers show `healthy` in `docker compose ps`

---

## 3. Business Functionality (Manual Smoke Test)

### Authentication
- [ ] Login with owner account succeeds
- [ ] Wrong password returns `401`
- [ ] JWT expires correctly (access: 15 min)

### Products
- [ ] Create a new product with price and stock
- [ ] Update the product — changes persist
- [ ] Stock adjustment works (manual +/-)

### POS / Sales
- [ ] Complete a cash sale with 1+ items
- [ ] Invoice PDF generates and downloads
- [ ] Invoice shows correct totals (no rounding errors)
- [ ] Stock deducted after sale

### Installments
- [ ] Create an installment product and plan
- [ ] Create an installment sale for a customer
- [ ] Record an installment payment
- [ ] Installment receipt PDF generates with correct schedule

### Customers
- [ ] Create a customer
- [ ] View customer order history

### Reports
- [ ] Sales report loads for today's date range
- [ ] Inventory report shows correct stock values

### Users (Owner only)
- [ ] Create a cashier account
- [ ] Cashier can log in and access POS only
- [ ] Cashier cannot access reports or settings

---

## 4. Security Verification

- [ ] `JWT_ACCESS_SECRET` is non-default (not `REPLACE_ME_*`)
- [ ] `JWT_REFRESH_SECRET` is non-default and **different** from access secret
- [ ] `PLATFORM_DEVELOPER_SETUP_TOKEN` is a strong non-default value
- [ ] MongoDB port 27017 is **not** publicly accessible
- [ ] Redis port 6379 is **not** publicly accessible
- [ ] No plaintext passwords in `.env`

---

## 5. Database

- [ ] MongoDB backup taken: `.\scripts\backup\mongo-backup.ps1`
- [ ] Backup file exists in `.\backups\mongo\` with size > 10 KB
- [ ] Invoice counters are intact (sequential invoice numbers not reset)

---

## 6. PDF Output Verification

- [ ] Invoice PDF — navy/amber theme, correct layout
- [ ] Invoice PDF — Urdu caption "رسید / انوائس" visible
- [ ] Invoice PDF — customer details correct
- [ ] Installment receipt — shows full payment schedule
- [ ] Installment receipt — shows payment history
- [ ] Installment receipt — 3-column signature section

---

## Deployment Steps

```powershell
# 1. Backup
.\scripts\backup\mongo-backup.ps1

# 2. Pull latest
git pull origin main

# 3. Rebuild (always rebuild after code changes)
npm run docker:rebuild

# 4. Verify
.\scripts\verify-deployment.ps1

# 5. Manual smoke test (see section 3 above)
```

---

## Rollback Procedure

```powershell
# Stop current stack
npm run docker:stop

# Find the backup (taken in step 1 above)
Get-ChildItem .\backups\mongo\ | Sort-Object LastWriteTime -Descending | Select-Object -First 3

# Restore backup
$backup = ".\backups\mongo\<timestamp>.zip"
Expand-Archive $backup -DestinationPath ".\restore-tmp"
mongorestore --uri="mongodb://localhost:27017/pos" --drop --gzip ".\restore-tmp\<timestamp>\pos\"

# Start previous Docker image (if tagged)
# docker compose up -d --no-build

# Or rebuild from previous git commit
# git checkout <previous-commit>
# npm run docker:rebuild
```

---

## Post-Deployment Sign-Off

| Check | Person | Date |
|-------|--------|------|
| All automated tests pass | | |
| Docker stack healthy | | |
| Business smoke test complete | | |
| Security checklist verified | | |
| Backup confirmed | | |
