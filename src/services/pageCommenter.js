'use strict';

const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { normalizeUrl } = require('../utils/url');
const { assertPublicUrl } = require('../utils/ssrfGuard');
const { fetchWithSmartAgent } = require('../utils/smartFetch');
const { BUSINESS_AUDIT_USER_AGENT } = require('../config/env');
const {
  ensureBrowserType,
  PLAYWRIGHT_NAV_TIMEOUT_MS,
  PLAYWRIGHT_RENDER_TIMEOUT_MS,
} = require('../integrations/playwright/pool');

const ALT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const CHROME_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FIREFOX_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';

function parseTitleFromHtml(html = '') {
  try {
    const $ = cheerio.load(html);
    return $('title').first().text() || '';
  } catch {
    return '';
  }
}

/**
 * Inject `<base href="...">` into the captured HTML so relative URLs resolve
 * against the original page when the captured copy is displayed in an iframe.
 * Also strips CSP meta tags that would block embedded asset loading.
 */
function applyBaseHref(html = '', pageUrl = '') {
  const normalized = normalizeUrl(pageUrl);
  if (!html || !normalized) return html;
  try {
    const $ = cheerio.load(html);
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();
    $('meta[content*="content-security-policy"]').remove();
    const hasBase = $('head base[href]').length > 0;
    if (!hasBase) {
      $('head').prepend(`<base href="${normalized}" />`);
      return $.html();
    }
    return html;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to inject base href');
    return html;
  }
}

/**
 * Inline `<link rel="stylesheet">` references into `<style>` blocks so the
 * captured snapshot keeps its styling without re-fetching external CSS.
 */
async function inlineStylesServerSide(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const links = $('link[rel~="stylesheet"]');
    if (!links.length) return html;
    for (const el of links.toArray()) {
      const href = $(el).attr('href');
      if (!href) continue;
      try {
        const abs = new URL(href, baseUrl).toString();
        // eslint-disable-next-line no-await-in-loop
        const css = await fetchWithSmartAgent(abs, { allowInsecureRetry: true }).then((r) =>
          r.text(),
        );
        $(el).replaceWith(`<style data-inline-from="${abs}">\n${css}\n</style>`);
      } catch (err) {
        logger.warn({ href, err: err.message }, 'Failed to inline stylesheet (server)');
      }
    }
    return $.html();
  } catch (err) {
    logger.warn({ err: err.message }, 'Inline styles (server) failed');
    return html;
  }
}

async function inlineStylesWithPlaywright(page) {
  try {
    await page.addStyleTag({ content: '' });
    await page.evaluate(async () => {
      const links = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'));
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(href, { credentials: 'omit' });
          // eslint-disable-next-line no-await-in-loop
          const css = await res.text();
          const style = document.createElement('style');
          style.setAttribute('data-inline-from', href);
          style.textContent = css;
          link.replaceWith(style);
        } catch (err) {
          // keep the original link if inlining fails
        }
      }
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Inline styles (playwright) failed');
  }
}

/**
 * Render the page with a headless browser so JS-heavy SPAs are captured.
 * Returns `null` when no browser engine is available, letting callers fall
 * back to plain HTTP fetch.
 */
async function renderPageWithBrowser(url) {
  const preferred = ['chromium', 'firefox'];
  for (const browserName of preferred) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const browserType = await ensureBrowserType(browserName);
      if (!browserType) continue;
      const agent =
        browserName === 'chromium'
          ? CHROME_BROWSER_UA
          : browserName === 'firefox'
            ? FIREFOX_BROWSER_UA
            : ALT_BROWSER_UA;
      // eslint-disable-next-line no-await-in-loop
      const browser = await browserType.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        // eslint-disable-next-line no-await-in-loop
        const context = await browser.newContext({
          userAgent: agent,
          viewport: { width: 1400, height: 900 },
          bypassCSP: true,
        });
        // Playwright drives Chromium's own network stack, so the undici
        // connector in utils/smartFetch.js does not apply here. Filter every
        // request the page makes — the initial navigation, each redirect hop,
        // and every subresource — so the browser cannot be steered onto
        // loopback or the LAN either.
        // eslint-disable-next-line no-await-in-loop
        await context.route('**/*', (route) => {
          try {
            assertPublicUrl(route.request().url());
            route.continue();
          } catch {
            route.abort();
          }
        });
        // eslint-disable-next-line no-await-in-loop
        const page = await context.newPage();
        // eslint-disable-next-line no-await-in-loop
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PLAYWRIGHT_NAV_TIMEOUT_MS });
        // eslint-disable-next-line no-await-in-loop
        await page.waitForLoadState('networkidle', { timeout: PLAYWRIGHT_NAV_TIMEOUT_MS }).catch(() => {});
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const totalHeight =
            document.body.scrollHeight || document.documentElement.scrollHeight || 2000;
          let y = 0;
          const step = Math.max(window.innerHeight * 0.6, 300);
          while (y < totalHeight) {
            y += step;
            window.scrollTo(0, y);
            await wait(500);
          }
          window.scrollTo(0, 0);
          await wait(2000);
        });
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(PLAYWRIGHT_RENDER_TIMEOUT_MS);
        // eslint-disable-next-line no-await-in-loop
        await inlineStylesWithPlaywright(page);
        // eslint-disable-next-line no-await-in-loop
        const content = await page.content();
        const finalUrl = page.url();
        return { html: content, finalUrl };
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await browser.close();
      }
    } catch (err) {
      logger.warn({ browserName, err: err.message }, 'Playwright capture failed, trying next');
    }
  }
  return null;
}

async function fetchPageCommentHtml(url) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    const err = new Error('Enter a valid URL to capture.');
    err.status = 400;
    throw err;
  }
  // The connector blocks this anyway, but only as an opaque socket failure.
  // Checking here turns "Failed to fetch page" into a 400 that says why.
  assertPublicUrl(normalizedUrl);

  const headersBase = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
  };

  const tryFetch = async (target, ua, allowInsecure = false) => {
    const response = await fetchWithSmartAgent(target, {
      method: 'GET',
      headers: { ...headersBase, 'user-agent': ua },
      redirect: 'follow',
      timeout: 18000,
      // User-supplied page URL — tolerate misconfigured customer certs.
      // The legacy `agent` param is ignored by native fetch; smartFetch's
      // allowInsecureRetry routes the retry through undici's dispatcher.
      allowInsecureRetry: allowInsecure,
    });
    const html = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.detail = (html || '').slice(0, 400);
      throw error;
    }
    return { html, finalUrl: response.url || target };
  };

  const userAgents = [BUSINESS_AUDIT_USER_AGENT, ALT_BROWSER_UA];
  let lastError = null;

  const rendered = await renderPageWithBrowser(normalizedUrl);
  if (rendered && rendered.html) return rendered;

  for (const ua of userAgents) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await tryFetch(normalizedUrl, ua, false);
    } catch (err) {
      lastError = err;
    }
  }

  if (normalizedUrl.startsWith('https://')) {
    const fallbackUrl = normalizedUrl.replace(/^https:\/\//i, 'http://');
    for (const ua of userAgents) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await tryFetch(fallbackUrl, ua, true);
      } catch (err) {
        lastError = err;
      }
    }
  }

  const error = new Error(
    lastError?.status
      ? `Page fetch failed (HTTP ${lastError.status}). The site may be blocking direct capture.`
      : 'Failed to fetch page.',
  );
  error.status = lastError?.status || 502;
  error.detail = lastError?.detail || lastError?.message;
  throw error;
}

function injectCommentOverlay(html = '', comments = [], meta = {}) {
  const safeComments = Array.isArray(comments) ? comments : [];
  const payload = JSON.stringify(safeComments);
  const metaJson = JSON.stringify({ title: meta.title || '', url: meta.url || '' });
  const snippet = `
<style>
  .pc-overlay-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .pc-badge{position:absolute;min-width:26px;height:26px;border-radius:999px;background:#0f172a;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.14);pointer-events:auto;cursor:pointer;transition:transform .15s ease;}
  .pc-badge:hover{transform:scale(1.05);}
  .pc-note{position:absolute;max-width:280px;background:#0b1224;color:#e2e8f0;border-radius:12px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 50px rgba(0,0,0,0.35);padding:10px 12px;font-size:13px;line-height:1.45;pointer-events:auto;}
  .pc-note strong{display:block;color:#9ae6b4;margin-bottom:4px;}
</style>
<script>
(function(){
  const comments = ${payload};
  const meta = ${metaJson};
  const layer = document.createElement('div');
  layer.className = 'pc-overlay-layer';
  const badgeContainer = document.createElement('div');
  const noteContainer = document.createElement('div');
  layer.appendChild(badgeContainer);
  layer.appendChild(noteContainer);
  const width = document.documentElement.scrollWidth || document.body.scrollWidth || window.innerWidth;
  const height = document.documentElement.scrollHeight || document.body.scrollHeight || window.innerHeight;
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '';
  comments.forEach((c, idx) => {
    const left = (c.x || 0) * width;
    const top = (c.y || 0) * height;
    const badge = document.createElement('div');
    badge.className = 'pc-badge';
    badge.style.left = left + 'px';
    badge.style.top = top + 'px';
    badge.textContent = idx + 1;
    const note = document.createElement('div');
    note.className = 'pc-note';
    note.style.left = (left + 20) + 'px';
    note.style.top = (top + 20) + 'px';
    note.innerHTML = '<strong>Comment #' + (idx + 1) + '</strong><div>' + (c.text || '') + '</div>' + (meta.url ? '<div style="margin-top:6px;font-size:12px;color:#94a3b8;">' + meta.url + '</div>' : '') + (c.createdAt ? '<div style="margin-top:4px;font-size:11px;color:#94a3b8;">Added ' + formatTime(c.createdAt) + '</div>' : '');
    note.style.display = 'none';
    badge.addEventListener('mouseenter', () => { note.style.display = 'block'; });
    badge.addEventListener('mouseleave', () => { note.style.display = 'none'; });
    badgeContainer.appendChild(badge);
    noteContainer.appendChild(note);
  });
  document.body.appendChild(layer);
})();
</script>
`;
  if (!html) return snippet;
  const closingBody = /<\/body\s*>/i;
  if (closingBody.test(html)) return html.replace(closingBody, `${snippet}</body>`);
  return `${html}\n${snippet}`;
}

module.exports = {
  ALT_BROWSER_UA,
  CHROME_BROWSER_UA,
  FIREFOX_BROWSER_UA,
  parseTitleFromHtml,
  applyBaseHref,
  inlineStylesServerSide,
  inlineStylesWithPlaywright,
  renderPageWithBrowser,
  fetchPageCommentHtml,
  injectCommentOverlay,
};
