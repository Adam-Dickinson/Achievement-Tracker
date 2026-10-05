export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: trophy-art:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')
