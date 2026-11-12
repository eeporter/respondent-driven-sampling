import { Types } from 'mongoose';

// Turns a request's query string into a plain equality filter that is safe to
// hand to MongoDB. Express parses `?field[$op]=x` into `{ field: { $op: 'x' } }`,
// which would let callers inject query operators (including `$where`), so only
// plain field names with string values are kept; anything else is rejected.
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;

export class InvalidQueryError extends Error {
	status = 400;
	constructor(message: string) {
		super(message);
		this.name = 'InvalidQueryError';
	}
}

export function toEqualityFilter(query: unknown): Record<string, string> {
	const filter: Record<string, string> = {};
	if (query === null || typeof query !== 'object') return filter;
	for (const [key, value] of Object.entries(query)) {
		if (!FIELD_NAME.test(key)) {
			throw new InvalidQueryError(`Invalid query field: ${key}`);
		}
		if (typeof value !== 'string') {
			throw new InvalidQueryError(
				`Query field ${key} must be a single plain value`
			);
		}
		filter[key] = value;
	}
	return filter;
}

export function isValidObjectId(value: string): boolean {
	return Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value);
}
