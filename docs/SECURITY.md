# V2 security verification

The edge Worker forwards authorization to the origin and applies `private, no-store` to proxied API responses. The API defaults to the same policy on direct responses. Apply explicit cache bypass rules for `/api` and `/api/*` at the Cloudflare zone and verify both browser and edge behavior with authenticated requests. Keep account and customer records out of application logs.

Keep the Node origin behind authenticated ingress. Before making it accessible, verify HTTPS, proxy trust, IP and identity-based rate limits, API allowlists, secret rotation, staff session revocation, developer MFA, and least-privilege support access with audit records. The origin authorization and rate limits remain the enforcement point for authenticated operations.

Staging acceptance requires tests with at least two tenants for API reads and writes, queues, exports, asset access and restore authorization. Verify payment retries and concurrent payment submission against the real database transaction path. The Worker tests exercise forwarding and cache controls, and are only one part of the security evidence.
