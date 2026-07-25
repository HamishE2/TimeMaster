import { geolocation, ipAddress, next } from '@vercel/functions'

const ALLOWED_COUNTRY = 'AU'
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60
const buckets = new Map()
let requestsSinceSweep = 0

const isLocalRequest = request => {
  const { hostname } = new URL(request.url)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

const isDocumentRequest = request => {
  if (request.method !== 'GET') return false
  if (request.headers.get('sec-fetch-dest') === 'document') return true
  return (request.headers.get('accept') || '').includes('text/html')
}

const sweepExpiredBuckets = now => {
  requestsSinceSweep += 1
  if (requestsSinceSweep < 256 && buckets.size < 10_000) return
  requestsSinceSweep = 0
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

const consumeRequest = (key, now) => {
  sweepExpiredBuckets(now)
  const current = buckets.get(key)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    : current

  bucket.count += 1
  buckets.set(key, bucket)

  return {
    allowed: bucket.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.count),
    resetAt: bucket.resetAt,
  }
}

const textResponse = (body, status, headers = {}) => new Response(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  },
})

export const config = {
  matcher: '/:path*',
}

export default function middleware(request) {
  const country = geolocation(request).country || request.headers.get('x-vercel-ip-country')

  if (!isLocalRequest(request) && country !== ALLOWED_COUNTRY) {
    return textResponse('TimeMaster is only available in Australia.', 403)
  }

  if (!isDocumentRequest(request)) return next()

  const clientIp = ipAddress(request)
  if (!clientIp) return next()

  const now = Date.now()
  const result = consumeRequest(clientIp, now)
  const rateLimitHeaders = {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }

  if (!result.allowed) {
    return textResponse('Too many requests. Try again shortly.', 429, {
      ...rateLimitHeaders,
      'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - now) / 1000))),
    })
  }

  return next({ headers: rateLimitHeaders })
}
