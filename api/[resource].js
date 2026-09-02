import airportCongestion from '../server/api/airport-congestion.js';
import customs from '../server/api/customs.js';
import gimpoAirportCongestion from '../server/api/gimpo-airport-congestion.js';
import googleTrends from '../server/api/google-trends.js';
import naverCafePopular from '../server/api/naver-cafe-popular.js';
import bidscout from '../server/api/bidscout.js';
import mathgrader from '../server/api/mathgrader.js';
import portfolioNotion from '../server/api/portfolio-notion.js';
import usedCarRegistration from '../server/api/used-car-registration.js';

// One deployed function preserves these public API URLs. Keep imports static
// so Vercel includes each implementation without exposing it as a function.
const handlers = new Map([
  ['airport-congestion', airportCongestion],
  ['customs', customs],
  ['gimpo-airport-congestion', gimpoAirportCongestion],
  ['google-trends', googleTrends],
  ['naver-cafe-popular', naverCafePopular],
  ['bidscout', bidscout],
  ['mathgrader', mathgrader],
  ['portfolio-notion', portfolioNotion],
  ['used-car-registration', usedCarRegistration],
]);

export default function handler(req, res) {
  // Do not trust req.query.resource: a client can supply or repeat that key.
  // Reading the raw pathname also rejects encoded separators and dot segments
  // instead of normalizing them into another endpoint.
  const pathname = typeof req.url === 'string' ? req.url.split('?')[0] : '';
  const resource = /^\/api\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1];
  const selected = handlers.get(resource);
  if (!selected) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ ok: false, error: 'not_found' });
  }

  // Pass through the same request/response objects: methods, body, query,
  // upstream error handling, cache headers and CORS remain handler-owned.
  return selected(req, res);
}
