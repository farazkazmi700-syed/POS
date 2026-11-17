# Initial data quality findings

Evidence: [live metadata](reports/data-profile.json), collected 2026-11-15.

## Checks performed

Reference checks cover observed tenant and branch references, order cashiers and
line-item products, installment plan orders/customers, installment-sale
customers/products, stock products, subscription plans, user branch assignments,
admin-audit actors and recovery-challenge users. No missing targets or
cross-tenant targets were found in these checks. Null/missing references and
empty arrays are excluded; zero findings are not proof of complete integrity.

## Findings requiring explicit schema handling

- Branches are empty despite three tenants. Do not manufacture historical branch
  records or require non-null branch references during import.
- Thirteen orders have no customer snapshot; seventeen lack an idempotency key;
  one lacks an invoice PDF path. These are not grounds for discarding sales.
- Optional customer address/CNIC/guarantor and product SKU/category/attributes
  fields are missing in some documents. Missing and null must not be silently
  converted into fabricated values.
- Five legacy installment plans exist while the separate installment product
  and sale collections are empty. Both model families are referenced by code;
  do not collapse one into the other without explicit field mapping.
- Three users have no branchIds field. Authentication must preserve legacy
  permission semantics rather than treating migration defaults as new grants.
- Code refers to platform modules, password_reset_tokens and recovery_codes,
  which were not present in the live collection list. Absence in this snapshot
  does not justify deleting support or assuming other installations are empty.

## Open checks / cutover blockers

1. Business-to-client-PC mapping and control-plane host have not been supplied.
2. Nested BSON types, array element validity, date-only values and optional-field
   semantics require full profiling against the final source snapshot.
3. Duplicate business-key checks beyond existing index metadata remain pending.
4. Exact-decimal monetary, inventory and payment reconciliation is pending.
5. Full backup/restore, file and Redis job reconciliation are not yet verified.
6. The pre-existing backend password recovery compile errors need resolution
   before a reliable source/target regression baseline can be established.

No rows were repaired, invented, transferred or deleted. No acceptance criterion
for PostgreSQL cutover is claimed as passed.
