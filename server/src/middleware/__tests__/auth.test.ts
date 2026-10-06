import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest
} from '@jest/globals';
import { NextFunction, Response } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Location from '../../database/location/mongoose/location.model';
import Survey from '../../database/survey/mongoose/survey.model';
import User from '../../database/user/mongoose/user.model';
import {
	ApprovalStatus,
	HubType,
	LocationType
} from '../../database/utils/constants';
import { ACTIONS, ROLES, SUBJECTS } from '../../permissions/constants';
import { AuthenticatedRequest } from '../../types/auth';
import { generateAuthToken } from '../../utils/authTokenHandler';
import { auth } from '../auth';

const TEST_SECRET = 'test-secret-key';
const originalEnv = process.env.AUTH_SECRET;

describe('Auth Middleware', () => {
	let mongoServer: MongoMemoryServer;
	let locationId: mongoose.Types.ObjectId;
	let mockReq: Partial<AuthenticatedRequest>;
	let mockRes: Partial<Response>;
	let mockNext: jest.MockedFunction<NextFunction>;

	// Insert a user directly (as the model tests do) and return its id
	async function createUser(
		role: string,
		approvalStatus: ApprovalStatus
	): Promise<string> {
		const [user] = await User.insertMany([
			{
				firstName: 'John',
				lastName: 'Doe',
				email: `john+${new mongoose.Types.ObjectId()}@example.com`,
				phone: '0000000000',
				role,
				approvalStatus,
				approvedByUserObjectId: new mongoose.Types.ObjectId(),
				locationObjectId: locationId,
				permissions: []
			}
		]);
		return user._id.toString();
	}

	function withToken(token: string) {
		mockReq.headers = { authorization: `Bearer ${token}` };
	}

	async function runAuth() {
		await auth(
			mockReq as AuthenticatedRequest,
			mockRes as Response,
			mockNext
		);
	}

	beforeAll(async () => {
		process.env.AUTH_SECRET = TEST_SECRET;
		mongoServer = await MongoMemoryServer.create();
		await mongoose.connect(mongoServer.getUri());
	});

	afterAll(async () => {
		process.env.AUTH_SECRET = originalEnv;
		await mongoose.disconnect();
		await mongoServer.stop();
	});

	beforeEach(async () => {
		await User.deleteMany({});
		await Survey.deleteMany({});
		await Location.deleteMany({});

		const location = await new Location({
			hubName: 'Test Hub',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '123 Test St'
		}).save();
		locationId = location._id as mongoose.Types.ObjectId;

		mockReq = { headers: {} };
		mockRes = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			sendStatus: jest.fn().mockReturnThis()
		} as Partial<Response>;
		mockNext = jest.fn() as jest.MockedFunction<NextFunction>;
	});

	it('passes an approved user and attaches their permissions', async () => {
		const userId = await createUser(ROLES.VOLUNTEER, ApprovalStatus.APPROVED);
		withToken(generateAuthToken(userId));

		await runAuth();

		expect(mockNext).toHaveBeenCalled();
		expect(mockRes.status).not.toHaveBeenCalled();
		const ability = mockReq.authorization!;
		expect(ability).toBeDefined();
		// Volunteer role rules, scoped to this user
		expect(
			ability.can(ACTIONS.CASL.READ, {
				__caslSubjectType__: SUBJECTS.USER,
				_id: userId
			} as any)
		).toBe(true);
		expect(
			ability.can(ACTIONS.CASL.READ, {
				__caslSubjectType__: SUBJECTS.USER,
				_id: new mongoose.Types.ObjectId().toString()
			} as any)
		).toBe(false);
	});

	it('uses the role stored in the database, not anything in the token', async () => {
		const userId = await createUser(ROLES.ADMIN, ApprovalStatus.APPROVED);
		withToken(generateAuthToken(userId));

		await runAuth();

		expect(mockNext).toHaveBeenCalled();
		// Admins can read every user; a volunteer could not
		expect(
			mockReq.authorization!.can(ACTIONS.CASL.READ, {
				__caslSubjectType__: SUBJECTS.USER,
				_id: new mongoose.Types.ObjectId().toString()
			} as any)
		).toBe(true);
	});

	it('rejects a request with no token', async () => {
		await runAuth();

		expect(mockRes.status).toHaveBeenCalledWith(401);
		expect(mockRes.json).toHaveBeenCalledWith({
			message: 'Access denied. No token provided'
		});
		expect(mockNext).not.toHaveBeenCalled();
	});

	it('rejects a malformed authorization header', async () => {
		mockReq.headers = { authorization: 'InvalidFormat' };

		await runAuth();

		expect(mockRes.status).toHaveBeenCalledWith(401);
		expect(mockRes.json).toHaveBeenCalledWith({
			message: expect.stringContaining('Invalid Token')
		});
		expect(mockNext).not.toHaveBeenCalled();
	});

	it('rejects an invalid token', async () => {
		withToken('invalid.token.here');

		await runAuth();

		expect(mockRes.status).toHaveBeenCalledWith(401);
		expect(mockNext).not.toHaveBeenCalled();
	});

	it('rejects a token signed with a different secret', async () => {
		const userId = await createUser(ROLES.ADMIN, ApprovalStatus.APPROVED);
		process.env.AUTH_SECRET = 'some-other-secret';
		const forged = generateAuthToken(userId);
		process.env.AUTH_SECRET = TEST_SECRET;
		withToken(forged);

		await runAuth();

		expect(mockRes.status).toHaveBeenCalledWith(401);
		expect(mockNext).not.toHaveBeenCalled();
	});

	it('rejects a valid token for a user that no longer exists', async () => {
		withToken(generateAuthToken(new mongoose.Types.ObjectId().toString()));

		await runAuth();

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({
			message: 'User account not found. Please contact Administration.'
		});
		expect(mockNext).not.toHaveBeenCalled();
	});

	it.each([ApprovalStatus.PENDING, ApprovalStatus.REJECTED])(
		'rejects a %s user',
		async status => {
			const userId = await createUser(ROLES.VOLUNTEER, status);
			withToken(generateAuthToken(userId));

			await runAuth();

			expect(mockRes.status).toHaveBeenCalledWith(403);
			expect(mockRes.json).toHaveBeenCalledWith({
				message:
					'User account not approved yet. Please contact Administration.'
			});
			expect(mockNext).not.toHaveBeenCalled();
		}
	);
});
