const ACCESS_TOKEN_MAX_AGE = 60 * 60;          // 1 hour
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function cookieAttrs(maxAge) {
  return [`Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=${maxAge}`].join('; ');
}

export function setSessionCookies(res, { accessToken, refreshToken }) {
  res.setHeader('Set-Cookie', [
    `sb-access-token=${accessToken}; ${cookieAttrs(ACCESS_TOKEN_MAX_AGE)}`,
    `sb-refresh-token=${refreshToken}; ${cookieAttrs(REFRESH_TOKEN_MAX_AGE)}`
  ]);
}

export function setAccessOnlyCookie(res, { accessToken }) {
  res.setHeader('Set-Cookie', [`sb-access-token=${accessToken}; ${cookieAttrs(ACCESS_TOKEN_MAX_AGE)}`]);
}

export function clearSessionCookies(res) {
  const expired = cookieAttrs(0);
  res.setHeader('Set-Cookie', [
    `sb-access-token=; ${expired}`,
    `sb-refresh-token=; ${expired}`
  ]);
}
