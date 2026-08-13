/**
 * Centralized URL validator for KManager to prevent XSS (KMAN-SEC-01/02).
 * Only allows safe web protocols (http, https).
 */
export function safeAttachmentUrl(url) {
  if (!url) return '#';
  const cleanUrl = String(url).trim();
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return cleanUrl;
    }
  } catch (e) {
    // If URL parsing fails, check if it's a relative path or storage key (safe)
    if (cleanUrl.startsWith('/') || cleanUrl.startsWith('./') || cleanUrl.startsWith('../')) {
      return cleanUrl;
    }
  }
  return 'about:blank';
}

/**
 * Hardened HTML attribute escaper.
 * Replaces critical characters to prevent attribute breakout.
 */
export function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
