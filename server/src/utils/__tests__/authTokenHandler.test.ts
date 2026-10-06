import { describe, expect, it, beforeAll, afterAll, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Mock environment variable for testing
const TEST_SECRET = 'test-secret-key';
const originalEnv = process.env.AUTH_SECRET;
const USER_OBJECT_ID = '6901027707fdae19aae38d4c';

// Set environment variable before import
process.env.AUTH_SECRET = TEST_SECRET;

import { generateAuthToken, verifyAuthToken } from '../authTokenHandler';

describe('authTokenHandler', () => {
	beforeAll(() => {
		process.env.AUTH_SECRET = TEST_SECRET;
	});

	afterAll(() => {
		process.env.AUTH_SECRET = originalEnv;
	});

	describe('generateAuthToken', () => {
		it('should generate a valid JWT token', () => {
			const token = generateAuthToken(USER_OBJECT_ID);
			expect(token).toBeDefined();
			expect(typeof token).toBe('string');
			expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
		});

		it('should include user data in the token payload', () => {
			const token = generateAuthToken(USER_OBJECT_ID);
			const decoded = jwt.verify(token, TEST_SECRET) as any;

			// Only the user's id is signed; role and approval are read from the
			// database on every request, so a role change takes effect at once.
			expect(decoded.userObjectId).toBe(USER_OBJECT_ID);
			expect(decoded.firstName).toBeUndefined();
			expect(decoded.role).toBeUndefined();
		});

		it('should set token expiration to 12 hours', () => {
			const token = generateAuthToken(USER_OBJECT_ID);
			const decoded = jwt.verify(token, TEST_SECRET) as any;
			
			expect(decoded.exp).toBeDefined();
			expect(decoded.iat).toBeDefined();
			
			// Check that expiration is approximately 12 hours from issue time
			const expirationTime = decoded.exp - decoded.iat;
			expect(expirationTime).toBe(12 * 60 * 60); // 12 hours in seconds
		});
	});

	describe('verifyAuthToken', () => {
		it('should verify a valid token', () => {
			const token = generateAuthToken(USER_OBJECT_ID);
			const decoded = verifyAuthToken(token);

			expect(decoded).toBeDefined();
			expect(decoded.userObjectId).toBe(USER_OBJECT_ID);
		});

		it('should throw error for invalid token', () => {
			const invalidToken = 'invalid.token.here';
			
			expect(() => {
				verifyAuthToken(invalidToken);
			}).toThrow();
		});

		it('should throw error for token with wrong secret', () => {
			const token = jwt.sign(
				{ userObjectId: USER_OBJECT_ID },
				'wrong-secret',
				{ expiresIn: '12h' }
			);
			
			expect(() => {
				verifyAuthToken(token);
			}).toThrow();
		});

		it('should throw error for expired token', () => {
			const expiredToken = jwt.sign(
				{ userObjectId: USER_OBJECT_ID },
				TEST_SECRET,
				{ expiresIn: '-1s' } // Already expired
			);
			
			expect(() => {
				verifyAuthToken(expiredToken);
			}).toThrow();
		});
	});
});