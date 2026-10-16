# Blog visitor counter

`https://blog.stargateedu.co.kr/` uses `/api/blog-visitors` on the existing
`stargate.stargate8225.workers.dev` Worker. Its counts are separate from the
portal's Cloudflare analytics and start when this integration is enabled.

- Storage: existing Firebase project `planning-with-ai-518df`, default Firestore.
- `siteVisitStats/blog`: cumulative daily visits, not lifetime unique people.
- `siteVisitStats/blog/days/YYYY-MM-DD`: daily count in Asia/Seoul.
- A daily SHA-256 receipt in `days/YYYY-MM-DD/visitors/` deduplicates each random
  browser UUID. The UUID itself, IP address, query string and referrer are not stored.
- One atomic commit creates the receipt and increments daily and total counts.
  Repeated requests and concurrent tabs do not increase counts twice.
- Public responses contain only aggregate counts. Writes accept the blog origin
  and a bounded JSON payload. Browser storage is a convenience, not the database
  authority. Clearing site data or using another browser can count a new visit.
- The existing server service account stays in the Worker secret. No new client
  Firestore permissions or authentication provider is required. Existing Firebase
  client rules remain unchanged; direct client access must remain denied.
- The blog template and generated homepage both include the counter so the daily
  RSS build preserves it. A failed request displays an unavailable indicator.

Checks: `node --test tests/blog-visitors.test.mjs tests/cloudflare-board.test.mjs`.
