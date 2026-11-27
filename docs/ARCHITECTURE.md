# Kazmion V2 cloud architecture

Cloudflare Workers Static Assets serves the existing React application. The browser calls `/api` on the same host. The Worker forwards the call to a dedicated HTTPS origin, disables shared caching, and preserves the upstream method, body, query and authorization. NestJS remains responsible for authentication, tenant identity and authorization. A customer hostname alone must never select a database or grant access.

The current NestJS application uses Mongoose, BullMQ and filesystem-backed provisioning. The PDF worker runs separately and uses Chromium. Keep those processes on a Node.js origin while migrating persistence incrementally. Hyperdrive is relevant only if an eventual Worker needs direct PostgreSQL access. The current Worker has no database access.

The target data model uses a platform database for identity, tenant routing, subscriptions and privileged audit records. Business databases require separately scoped credentials and versioned migrations. The offline Docker deployment already provisions PostgreSQL-backed document databases, and the repository contains relational migrations and sync rehearsal code. Those pieces require validation against the live write path before a cloud cutover. Use extracted, encrypted copies and reconcile transaction counts and monetary balances before approving any import. Keep live sync disabled.

Private invoice and customer document storage requires a separate R2 integration with server-authorized object keys and short-lived access. Keep the existing origin private until tenant isolation, privileged MFA, recovery and financial reconciliation are verified.

[Workers runtime compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) · [Static assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [Hyperdrive PostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
