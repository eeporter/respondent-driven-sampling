// Import required modules
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import nocache from 'nocache';

import { setupSwagger } from '@/config/swagger';
import connectDB from '@/database/index';
import { errorHandler } from '@/middleware/errorHandler';
import authRoutes from '@/routes/auth';
import locationsRoutes from '@/routes/locations';
import seedsRoutes from '@/routes/seeds';
import surveyRoutes from '@/routes/surveys';
import usersRoutes from '@/routes/users';
import validateReferralCodeRoute from '@/routes/validateReferralCode';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
await connectDB();

const app = express();

const isDev = process.env.NODE_ENV === 'development';

// Azure App Service sits behind one proxy; trust it so req.ip is the client's
// address (used by the login rate limiter)
app.set('trust proxy', 1);

// Log the path without the query string: list filters can carry names or
// phone numbers, which should not end up in server logs
morgan.token(
	'path-only',
	req => ((req as Request).originalUrl ?? req.url ?? '').split('?')[0]
);
app.use(
	morgan(
		':remote-addr - :remote-user [:date[clf]] ":method :path-only HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
	)
);

// SECURITY FIRST - Apply security middleware before any other middleware
// This ensures all requests are protected from the start
app.disable('x-powered-by');

// One Helmet configuration sets every security header for every response
// (routes, static files, the SPA fallback and errors alike)
app.use(
	helmet({
		contentSecurityPolicy: {
			useDefaults: false,
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				objectSrc: ["'none'"],
				imgSrc: ["'self'", 'data:'],
				styleSrc: ["'self'", "'unsafe-inline'"]
			}
		},
		frameguard: { action: 'deny' },
		strictTransportSecurity: {
			maxAge: 31536000, // 1 year in seconds
			includeSubDomains: true,
			preload: true
		},
		referrerPolicy: { policy: 'same-origin' }
	})
);

// Prevent browser caching of API responses and pages
app.use(nocache());

app.use(compression());

// The client is served from this same server, so cross-origin requests are
// only allowed for origins listed in CORS_ORIGIN (comma-separated), if any
const corsOrigins = (process.env.CORS_ORIGIN ?? '')
	.split(',')
	.map(origin => origin.trim())
	.filter(Boolean);
if (corsOrigins.length > 0) {
	app.use(
		cors({
			origin: corsOrigins,
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
			allowedHeaders: ['Content-Type', 'Authorization'],
			maxAge: 86400
		})
	);
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API documentation is only served in development
if (isDev) {
	setupSwagger(app);
}

app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/seeds', seedsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/', validateReferralCodeRoute);

// Serve the built client
const clientBuildPath = path.join(__dirname, '../dist');
app.use(express.static(clientBuildPath));

// Unknown API routes get a JSON 404; everything else is the single-page app
app.get('*', (req: Request, res: Response) => {
	if (req.originalUrl.startsWith('/api/')) {
		return res.status(404).json({ message: 'API endpoint not found' });
	}
	res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.use(errorHandler);

const PORT = parseInt(process.env.PORT ?? '1234', 10);
app.listen(PORT, '0.0.0.0', () => {
	console.log(
		`Server running with security headers at http://localhost:${PORT}`
	);
});
