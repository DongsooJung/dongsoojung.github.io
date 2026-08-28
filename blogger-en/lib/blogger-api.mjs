const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';
const SCOPE = 'https://www.googleapis.com/auth/blogger';

export function bloggerEnv(env = process.env) {
  return {
    clientId: env.BLOGGER_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: env.BLOGGER_CLIENT_SECRET || '',
    refreshToken: env.BLOGGER_REFRESH_TOKEN || '',
    blogId: env.BLOGGER_BLOG_ID || '',
    allowLive: env.BLOGGER_ALLOW_LIVE === '1',
  };
}

export async function exchangeRefreshToken(credentials, fetchImpl = fetch) {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error('Blogger OAuth env is incomplete (client id/secret/refresh token).');
  }
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`OAuth token exchange failed: ${payload.error || response.status}`);
  }
  return payload.access_token;
}

export function toBloggerPost(draft, { isDraft = true } = {}) {
  return {
    kind: 'blogger#post',
    title: draft.title,
    content: htmlFromMarkdown(draft.body),
    labels: uniqueLabels(draft),
    customMetaData: draft.description,
  };
}

export async function createPost({ blogId, accessToken, post, isDraft = true, fetchImpl = fetch }) {
  const url = `${BLOGGER_API}/blogs/${encodeURIComponent(blogId)}/posts?isDraft=${isDraft ? 'true' : 'false'}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(post),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Blogger API ${response.status}: ${payload.error?.message || 'request failed'}`);
  }
  return payload;
}

export function buildPublishRequest(draft, config, options = {}) {
  const credentials = bloggerEnv(options.env);
  const blogId = options.blogId || credentials.blogId || config.blog?.id;
  const live = Boolean(options.live) && credentials.allowLive;
  const post = toBloggerPost(draft, { isDraft: !live || options.asDraft !== false });
  return {
    live,
    asDraft: !live || options.asDraft !== false,
    blogId,
    endpoint: blogId ? `${BLOGGER_API}/blogs/${blogId}/posts` : null,
    scope: SCOPE,
    post,
  };
}

export function htmlFromMarkdown(markdown) {
  const escaped = escapeHtml(String(markdown || ''));
  const blocks = escaped.split(/\n{2,}/).map((block) => {
    const heading = block.match(/^#+\s+(.*)$/);
    if (heading) return `<h2>${heading[1]}</h2>`;
    const lines = block.split('\n').map((line) => line.replace(/^[-*]\s+/, '• '));
    return `<p>${lines.join('<br>')}</p>`;
  });
  return blocks.join('\n');
}

function uniqueLabels(draft) {
  const labels = [
    draft.topic?.category,
    ...(draft.keywords || []).slice(0, 4),
    'english',
    'global',
  ]
    .filter(Boolean)
    .map((label) => String(label).slice(0, 40));
  return [...new Set(labels)].slice(0, 8);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
