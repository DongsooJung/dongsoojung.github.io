# Private gateway deployment

This is a separate Vercel project for `stargateedu.co.kr`. In project settings, set **Root Directory** to `private-gateway`, enable **Include source files outside of the Root Directory in the Build Step**, and keep **Skip deployment when unaffected** disabled. The build imports the parent repository's public file filter and copies only tracked public files into `public/`. It fails if the parent checkout is unavailable.

Set the following encrypted **Production** environment variables before attaching the domain:

- `MONETIZATION_ALLOWED_HOST=stargate-private-gateway.vercel.app`
- `MONETIZATION_PASSWORD_HASH=sha256$<base64url SHA-256 digest of a random 48-character credential>`
- `MONETIZATION_SESSION_KEY=<at least 32 random characters, separate from the credential>`
- `MONETIZATION_HTML_GZIP_BASE64=<gzip-compressed private HTML, encoded as base64>`

The current encoded HTML environment value is about 28,400 characters. Check it together with other variables against Vercel's per-deployment environment variable size limit. Never put the raw HTML, credential, digest, signing key, or generated `public/` files in Git. The `public/` directory is ignored by `.gitignore`.

The public GitHub Pages URL serves only a login stub. It submits the password to this gateway's `/api/private-monetization` endpoint and replaces the page in memory after an authenticated response. The canonical URL remains on GitHub Pages and a reload requires login again. The gateway accepts cross-origin reads only from `https://stargateedu.co.kr`; its direct URL also requires authentication. Test both URLs after deployment. Earlier public commits and third-party caches may still hold an older copy of the page.
