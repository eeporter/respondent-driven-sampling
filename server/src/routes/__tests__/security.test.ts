// Route-level tests for the security fixes from the 2026-10-14 QA review.
// Each block names the finding it guards against.
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
import Seed from '@/database/seed/mongoose/seed.model';
import Survey from '@/database/survey/mongoose/survey.model';
import User from '@/database/user/mongoose/user.model';
import {
	ApprovalStatus,
	HubType,
	LocationType,
	SYSTEM_SURVEY_CODE
} from '@/database/utils/constants';
import { errorHandler } from '@/middleware/errorHandler';
import locationsRoutes from '@/routes/locations';
import seedsRoutes from '@/routes/seeds';
import surveyRoutes from '@/routes/surveys';
import usersRoutes from '@/routes/users';
import { generateAuthToken } from '@/utils/authTokenHandler';

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/seeds', seedsRoutes);
app.use('/api/locations', locationsRoutes);
app.use(errorHandler);

let mongoServer: MongoMemoryServer;
let locA: mongoose.Types.ObjectId;
let locB: mongoose.Types.ObjectId;
let superAdminId: string;
let phoneCounter = 0;

async function createUser(
	role: string,
	options: {
		location?: mongoose.Types.ObjectId;
		approvalStatus?: ApprovalStatus;
	} = {}
): Promise<string> {
	phoneCounter++;
	const approved =
		(options.approvalStatus ?? ApprovalStatus.APPROVED) ===
		ApprovalStatus.APPROVED;
	const [user] = await User.insertMany([
		{
			firstName: role,
			lastName: 'Test',
			email: `user${phoneCounter}@example.test`,
			phone: `+1555000${String(phoneCounter).padStart(4, '0')}`,
			role,
			approvalStatus: options.approvalStatus ?? ApprovalStatus.APPROVED,
			approvedByUserObjectId: approved ? superAdminId : null,
			locationObjectId: options.location ?? locA,
			permissions: []
		}
	]);
	return user._id.toString();
}

const bearer = (userId: string) => `Bearer ${generateAuthToken(userId)}`;

beforeAll(async () => {
	process.env.AUTH_SECRET = 'test-secret';
	mongoServer = await MongoMemoryServer.create();
	await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
	await mongoose.connection.close();
	await mongoServer.stop();
});

beforeEach(async () => {
	await Promise.all([
		User.deleteMany({}),
		Survey.deleteMany({}),
		Seed.deleteMany({}),
		Location.deleteMany({})
	]);
	const [a, b] = await Location.insertMany([
		{
			hubName: 'Hub A',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '1 A Street'
		},
		{
			hubName: 'Hub B',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '2 B Street'
		}
	]);
	locA = a._id as mongoose.Types.ObjectId;
	locB = b._id as mongoose.Types.ObjectId;
	superAdminId = new mongoose.Types.ObjectId().toString();
	superAdminId = await createUser('SUPER_ADMIN');
});

describe('Finding 1: admins cannot promote users above their own rights', () => {
	it.each(['SUPER_ADMIN', 'ADMIN'])(
		'rejects an admin setting a volunteer to %s',
		async role => {
			const admin = await createUser('ADMIN');
			const volunteer = await createUser('VOLUNTEER');

			const res = await request(app)
				.patch(`/api/users/${volunteer}`)
				.set('Authorization', bearer(admin))
				.send({ role });

			expect(res.status).toBe(403);
			expect((await User.findById(volunteer))?.role).toBe('VOLUNTEER');
		}
	);

	it('still lets an admin promote a volunteer to manager', async () => {
		const admin = await createUser('ADMIN');
		const volunteer = await createUser('VOLUNTEER');

		const res = await request(app)
			.patch(`/api/users/${volunteer}`)
			.set('Authorization', bearer(admin))
			.send({ role: 'MANAGER' });

		expect(res.status).toBe(200);
		expect(res.body.data.role).toBe('MANAGER');
	});

	it('lets a super admin set any role', async () => {
		const volunteer = await createUser('VOLUNTEER');

		const res = await request(app)
			.patch(`/api/users/${volunteer}`)
			.set('Authorization', bearer(superAdminId))
			.send({ role: 'ADMIN' });

		expect(res.status).toBe(200);
	});
});

describe('Finding 2: surveys are always credited to the logged-in user', () => {
	it('ignores a createdByUserObjectId sent by the client', async () => {
		const volunteer = await createUser('VOLUNTEER');
		const manager = await createUser('MANAGER', { location: locB });
		await Seed.create({ surveyCode: 'AAAA1111', locationObjectId: locA });

		const res = await request(app)
			.post('/api/surveys')
			.set('Authorization', bearer(volunteer))
			.send({
				surveyCode: 'AAAA1111',
				parentSurveyCode: SYSTEM_SURVEY_CODE,
				createdByUserObjectId: manager,
				locationObjectId: locA.toString(),
				responses: { q: 'a' }
			});

		expect(res.status).toBe(201);
		expect(res.body.data.createdByUserObjectId).toBe(volunteer);
	});

	it('works when the client sends no createdByUserObjectId', async () => {
		const volunteer = await createUser('VOLUNTEER');
		await Seed.create({ surveyCode: 'AAAA2222', locationObjectId: locA });

		const res = await request(app)
			.post('/api/surveys')
			.set('Authorization', bearer(volunteer))
			.send({
				surveyCode: 'AAAA2222',
				parentSurveyCode: SYSTEM_SURVEY_CODE,
				locationObjectId: locA.toString(),
				responses: { q: 'a' }
			});

		expect(res.status).toBe(201);
		expect(res.body.data.createdByUserObjectId).toBe(volunteer);
	});
});

describe('Finding 3: deleted users lose access', () => {
	it('rejects a deleted user with a still-valid token', async () => {
		const admin = await createUser('ADMIN');
		await User.findByIdAndUpdate(admin, { deletedAt: new Date() });

		const res = await request(app)
			.get('/api/users')
			.set('Authorization', bearer(admin));

		expect(res.status).toBe(401);
	});
});

describe('Finding 4: query strings cannot inject database operators', () => {
	it('rejects operators on the public locations list', async () => {
		const res = await request(app).get(
			'/api/locations?hubName[$regex]=Hub'
		);
		expect(res.status).toBe(400);
	});

	it('rejects $where on the public locations list', async () => {
		const res = await request(app).get(
			'/api/locations?$where=sleep(1000)||true'
		);
		expect(res.status).toBe(400);
	});

	it('still supports plain equality filters', async () => {
		const res = await request(app).get('/api/locations?hubName=Hub%20B');
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveLength(1);
		expect(res.body.data[0].hubName).toBe('Hub B');
	});

	it('rejects operators on the users list', async () => {
		const admin = await createUser('ADMIN');
		const res = await request(app)
			.get('/api/users?phone[$ne]=x')
			.set('Authorization', bearer(admin));
		expect(res.status).toBe(400);
	});
});

describe('Finding 5: managers can only create volunteers at their location', () => {
	it('rejects a manager creating a super admin', async () => {
		const manager = await createUser('MANAGER');
		const res = await request(app)
			.post('/api/users')
			.set('Authorization', bearer(manager))
			.send({
				firstName: 'New',
				lastName: 'User',
				email: 'new@example.test',
				phone: '+15559990001',
				role: 'SUPER_ADMIN',
				locationObjectId: locA.toString()
			});
		expect(res.status).toBe(403);
	});

	it('rejects a manager creating a volunteer at another location', async () => {
		const manager = await createUser('MANAGER');
		const res = await request(app)
			.post('/api/users')
			.set('Authorization', bearer(manager))
			.send({
				firstName: 'New',
				lastName: 'User',
				email: 'new@example.test',
				phone: '+15559990001',
				role: 'VOLUNTEER',
				locationObjectId: locB.toString()
			});
		expect(res.status).toBe(403);
	});

	it('lets a manager create a volunteer at their own location', async () => {
		const manager = await createUser('MANAGER');
		const res = await request(app)
			.post('/api/users')
			.set('Authorization', bearer(manager))
			.send({
				firstName: 'New',
				lastName: 'User',
				email: 'new@example.test',
				phone: '+15559990001',
				role: 'VOLUNTEER',
				locationObjectId: locA.toString()
			});
		expect(res.status).toBe(201);
	});
});

describe('Finding 8: seed codes cannot be listed by volunteers', () => {
	beforeEach(async () => {
		await Seed.create({ surveyCode: 'BBBB1111', locationObjectId: locB });
	});

	it('refuses a volunteer listing every seed', async () => {
		const volunteer = await createUser('VOLUNTEER');
		const res = await request(app)
			.get('/api/seeds')
			.set('Authorization', bearer(volunteer));
		expect(res.status).toBe(403);
	});

	it('lets a volunteer look up one seed by its code', async () => {
		const volunteer = await createUser('VOLUNTEER');
		const res = await request(app)
			.get('/api/seeds?surveyCode=BBBB1111')
			.set('Authorization', bearer(volunteer));
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveLength(1);
	});

	it('lets an admin list every seed', async () => {
		const admin = await createUser('ADMIN');
		const res = await request(app)
			.get('/api/seeds')
			.set('Authorization', bearer(admin));
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveLength(1);
	});
});

describe('Finding 10: the approver is whoever makes the approval', () => {
	it('records the logged-in admin, not the id in the request', async () => {
		const admin = await createUser('ADMIN');
		const pending = await createUser('VOLUNTEER', {
			approvalStatus: ApprovalStatus.PENDING
		});

		const res = await request(app)
			.patch(`/api/users/${pending}`)
			.set('Authorization', bearer(admin))
			.send({
				approvalStatus: ApprovalStatus.APPROVED,
				approvedByUserObjectId: superAdminId
			});

		expect(res.status).toBe(200);
		expect(res.body.data.approvedByUserObjectId).toBe(admin);
	});
});

describe('Finding 11: bad input is a 400, not a server error', () => {
	it('returns 400 for a malformed id', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
		const admin = await createUser('ADMIN');
		const res = await request(app)
			.get('/api/users/not-an-id')
			.set('Authorization', bearer(admin));
		expect(res.status).toBe(400);
		expect(JSON.stringify(res.body)).not.toContain('Cast to ObjectId');
	});
});
