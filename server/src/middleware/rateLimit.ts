import { NextFunction, Request, Response } from 'express';

// Small in-memory fixed-window rate limiter. The app runs as a single
// instance per location, so process memory is enough; counters reset on
// restart, which only loosens the limit briefly.

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(options: {
	windowMs: number;
	max: number;
	key: (req: Request) => string | null;
	now?: () => number;
}) {
	const buckets = new Map<string, Bucket>();
	const now = options.now ?? Date.now;

	function hit(key: string): Bucket {
		const t = now();
		let bucket = buckets.get(key);
		if (!bucket || bucket.resetAt <= t) {
			bucket = { count: 0, resetAt: t + options.windowMs };
			buckets.set(key, bucket);
		}
		bucket.count++;
		// Drop expired buckets now and then so the map cannot grow forever
		if (buckets.size > 10_000) {
			for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
		}
		return bucket;
	}

	return (req: Request, res: Response, next: NextFunction) => {
		const key = options.key(req);
		if (key === null) return next();
		const bucket = hit(key);
		if (bucket.count > options.max) {
			res.setHeader(
				'Retry-After',
				Math.ceil((bucket.resetAt - now()) / 1000).toString()
			);
			res.status(429).json({
				message:
					'Too many attempts. Please wait a few minutes and try again.'
			});
			return;
		}
		next();
	};
}

// Client IP without a port (Azure App Service can forward "ip:port")
export function clientIp(req: Request): string {
	const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
	const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
	return v4WithPort ? v4WithPort[1] : ip;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Per phone number: limits SMS sends and code guesses for one person
const perPhone = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	max: 5,
	key: req =>
		typeof req.body?.phone === 'string'
			? `${req.path}|phone|${req.body.phone}`
			: null
});

// Per client IP: limits one sender spraying many phone numbers
const perIp = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	max: 30,
	key: req => `${req.path}|ip|${clientIp(req)}`
});

export function otpRateLimit(req: Request, res: Response, next: NextFunction) {
	perIp(req, res, err => {
		if (err || res.headersSent) return next(err);
		perPhone(req, res, next);
	});
}
