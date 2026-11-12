// Tests for the login/signup fixes (findings 5, 6 and 12) with Twilio mocked out.
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest
} from '@jest/globals';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

import Location from '@/database/location/mongoose/location.model';
import User from '@/database/user/mongoose/user.model';
import authRoutes from '@/routes/auth';

// Called lazily from the mock factory below, which jest hoists above these lines
const mockSendCode = jest.fn(async (..._args: unknown[]) => ({
	status: 'pending'
}));
const mockCheckCode = jest.fn(async (..._args: unknown[]) => ({
	status: 'approved'
}));

jest.mock('twilio', () => ({
	__esModule: true,
	default: () => ({
		verify: {
			v2: {
				services: () => ({
					verifications: {
						create: (...args: unknown[]) => mockSendCode(...args)
					},
					verificationChecks: {
						create: (...args: unknown[]) => mockCheckCode(...args)
					}
				})
			}
		}
	})
}));


const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

let mongoServer: MongoMemoryServer;
let locationId: string;
let phoneCounter = 0;
const nextPhone = () =>
	`+1555100${String(++phoneCounter).padStart(4, '0')}`;

beforeAll(async () => {
	process.env.AUTH_SECRET = 'test-secret';
	mongoServer = await MongoMemoryServer.create();
	await mongoose.connect(mongoServer.getUri());
	const location = await Location.create({
		hubName: 'Hub',
		hubType: 'ESTABLISHMENT',
		locationType: 'ROOFTOP',
		address: '1 Street'
	});
	locationId = location.id;
});

afterAll(async () => {
	await mongoose.connection.close();
	await mongoServer.stop();
});

beforeEach(async () => {
	await User.deleteMany({});
	mockSendCode.mockClear();
	mockCheckCode.mockClear();
});

const signup = (phone: string, role: string) => ({
	firstName: 'New',
	lastName: 'Person',
	email: `${phone.slice(1)}@example.test`,
	phone,
	role,
	locationObjectId: locationId
});

describe('Finding 5: self-signup cannot ask for admin roles', () => {
	it.each(['ADMIN', 'SUPER_ADMIN'])('rejects signing up as %s', async role => {
		const phone = nextPhone();
		const send = await request(app)
			.post('/api/auth/send-otp-signup')
			.send(signup(phone, role));
		const verify = await request(app)
			.post('/api/auth/verify-otp-signup')
			.send({ ...signup(phone, role), code: '123456' });

		expect(send.status).toBe(400);
		expect(verify.status).toBe(400);
		expect(mockSendCode).not.toHaveBeenCalled();
		expect(await User.countDocuments()).toBe(0);
	});

	it.each(['VOLUNTEER', 'MANAGER'])('allows signing up as %s', async role => {
		const phone = nextPhone();
		const res = await request(app)
			.post('/api/auth/verify-otp-signup')
			.send({ ...signup(phone, role), code: '123456' });

		expect(res.status).toBe(200);
		expect((await User.findOne({ phone }))?.approvalStatus).toBe('PENDING');
	});
});

describe('Finding 12: login does not reveal who has an account', () => {
	it('answers the same for an unknown phone and sends no SMS', async () => {
		const res = await request(app)
			.post('/api/auth/send-otp-login')
			.send({ phone: nextPhone() });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe('OTP sent!');
		expect(mockSendCode).not.toHaveBeenCalled();
	});
});

describe('Finding 3: deleted users cannot log in', () => {
	it('rejects a correct code for a deleted account', async () => {
		const phone = nextPhone();
		// insertMany skips the approver hook, which needs a real approver
		await User.insertMany([
			{
				...signup(phone, 'VOLUNTEER'),
				approvalStatus: 'APPROVED',
				deletedAt: new Date()
			}
		]);

		const send = await request(app)
			.post('/api/auth/send-otp-login')
			.send({ phone });
		const verify = await request(app)
			.post('/api/auth/verify-otp-login')
			.send({ phone, code: '123456' });

		expect(mockSendCode).not.toHaveBeenCalled();
		expect(send.status).toBe(200);
		expect(verify.status).toBe(400);
		expect(verify.body.token).toBeUndefined();
	});
});

describe('Finding 6: login codes are rate limited', () => {
	it('blocks a sixth code request for the same phone', async () => {
		const phone = nextPhone();
		const body = signup(phone, 'VOLUNTEER');
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const res = await request(app)
				.post('/api/auth/send-otp-signup')
				.send(body);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
		expect(statuses[5]).toBe(429);
		expect(mockSendCode).toHaveBeenCalledTimes(5);
	});

	it('blocks repeated code guesses for the same phone', async () => {
		const phone = nextPhone();
		mockCheckCode.mockImplementation(async () => ({ status: 'pending' }));
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const res = await request(app)
				.post('/api/auth/verify-otp-login')
				.send({ phone, code: '000000' });
			statuses.push(res.status);
		}
		mockCheckCode.mockImplementation(async () => ({ status: 'approved' }));

		expect(statuses[5]).toBe(429);
	});
});
