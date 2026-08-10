/** Unified G2B bid proxy. kind: cnstwk | servc */
import { createBidHandler } from '../_lib/bid-pblanc-core.js';

const handlers = {
  cnstwk: createBidHandler('cnstwk'),
  servc: createBidHandler('servc'),
};

export default function handler(req, res) {
  const kind = String(req.query?.kind || '');
  const selected = handlers[kind];
  if (!selected) return res.status(404).json({ ok: false, error: 'unknown_bid_kind' });
  return selected(req, res);
}
