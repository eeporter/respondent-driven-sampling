import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

// Turns errors into JSON responses. Bad input (an invalid id, an invalid query
// or a failed validation) is the caller's mistake and gets a 4xx; anything else
// is logged and returned as a generic 500 so internals are not exposed.
export function errorHandler(
	err: Error & { status?: number; code?: string | number },
	_req: Request,
	res: Response,
	_next: NextFunction
): void {
	const isDev = process.env.NODE_ENV === 'development';

	if (err instanceof mongoose.Error.CastError) {
		res.status(400).json({ message: `Invalid value for ${err.path}` });
		return;
	}
	if (
		err instanceof mongoose.Error.ValidationError ||
		err instanceof mongoose.Error.StrictModeError
	) {
		res.status(400).json({
			message: isDev ? err.message : 'Invalid request'
		});
		return;
	}
	// Duplicate key, e.g. an email or phone that is already registered
	if (err.code === 11000) {
		res.status(409).json({
			message: 'A record with these details already exists'
		});
		return;
	}
	// Our own errors (ErrorCode, InvalidQueryError) carry a 4xx status and a
	// message written for the user
	if (
		typeof err.status === 'number' &&
		err.status >= 400 &&
		err.status < 500
	) {
		res.status(err.status).json({ message: err.message });
		return;
	}

	console.error(err.stack);
	res.status(500).json({
		message: isDev ? err.message : 'Internal server error'
	});
}
