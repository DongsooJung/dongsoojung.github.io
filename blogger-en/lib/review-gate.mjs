const PLACEHOLDER = /\[WRITE\]/;
const HANGUL = /[\uac00-\ud7a3]/;

export function evaluateDraft(draft, config = {}) {
  const errors = [];
  const warnings = [];
  const body = draft?.body || '';
  const minWords = Number(draft?.minWords || config.minWords || 1200);
  const wordCount = Number(draft?.wordCount || 0);

  if (!draft?.title) errors.push('missing-title');
  if (!draft?.slug) errors.push('missing-slug');
  if (draft?.language && draft.language !== 'en') errors.push('language-not-english');
  if (PLACEHOLDER.test(body)) errors.push('unfilled-write-blocks');
  if (HANGUL.test(body) || HANGUL.test(draft?.title || '')) errors.push('contains-hangul');
  if (wordCount < minWords) errors.push(`below-min-words:${wordCount}<${minWords}`);
  if (!draft?.monetization?.disclosureRequired) {
    warnings.push('no-monetization-disclosure-flag');
  }
  if (config.status === 'awaiting_plan') {
    errors.push('plan-not-ingested');
  }
  if (config.review?.requireHumanApproval !== false && draft?.status !== 'approved') {
    errors.push('not-approved');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    wordCount,
    minWords,
  };
}

export function canPublish(draft, config, options = {}) {
  const live = Boolean(options.live);
  const evaluation = evaluateDraft(draft, config);
  const extra = [];
  if (live && config.review?.allowLivePublish !== true) extra.push('live-publish-disabled');
  if (live && !options.blogId) extra.push('missing-blog-id');
  if (live && !options.accessToken) extra.push('missing-access-token');
  const errors = [...evaluation.errors, ...extra];
  return {
    ok: errors.length === 0,
    dryRun: !live,
    errors,
    warnings: evaluation.warnings,
  };
}

export function approveDraft(draft, actor = 'human', at = new Date()) {
  if (!draft) throw new Error('draft required');
  return {
    ...draft,
    status: 'approved',
    approvedBy: actor,
    approvedAt: at.toISOString(),
  };
}

export function rejectDraft(draft, reason = '', actor = 'human', at = new Date()) {
  return {
    ...draft,
    status: 'rejected',
    rejectedBy: actor,
    rejectedAt: at.toISOString(),
    rejectReason: reason,
  };
}
