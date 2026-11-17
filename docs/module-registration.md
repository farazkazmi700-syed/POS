# Module registration and subscriptions

The developer console reads its module catalog from `GET /api/developer/features`. Registered features appear in its subscription and account controls without another hardcoded UI list change. This endpoint is developer-only.

To implement a new module, register its key and label in `apps/api/src/common/features.ts`, add its validated feature fields to the plan/tenant DTOs and schemas, and add its shared frontend type/navigation entry. Protect its routes with feature, action, and module permissions. A source file alone is not a registered feature.

Subscription feature normalization defaults missing plan values to false. Assigning a plan copies its features to the business. Editing a plan's features updates all businesses assigned to that plan; those subscription settings replace individual feature overrides for those businesses. Staff permissions still apply within the business entitlement.

Developer access manages the catalog and subscriptions; it does not grant unrestricted access to tenant business records. Enable the module in a subscription before distributing it to subscribing businesses.

Plan save and subscriber propagation are separate database writes on the current standalone MongoDB deployment. If propagation fails, the request reports an error; retry the same update. Transactional propagation and per-account subscription exceptions are not implemented.
