import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test
} from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Location from '../../database/location/mongoose/location.model';
import Seed from '../../database/seed/mongoose/seed.model';
import Survey from '../../database/survey/mongoose/survey.model';
import User from '../../database/user/mongoose/user.model';
import { HubType, LocationType } from '../../database/utils/constants';
import {
	countLocationReferences,
	reassignLocationReferences
} from '../locationReferences';

describe('location references', () => {
	let mongoServer: MongoMemoryServer;
	let oldHub: any;
	let newHub: any;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();
		await mongoose.connect(mongoServer.getUri());
	});

	afterAll(async () => {
		await mongoose.connection.close();
		await mongoServer.stop();
	});

	beforeEach(async () => {
		await Promise.all([
			Seed.deleteMany({}),
			Survey.collection.deleteMany({}),
			Location.deleteMany({}),
			User.collection.deleteMany({})
		]);
		oldHub = await Location.create({
			hubName: 'Old Hub',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '1 Old St'
		});
		newHub = await Location.create({
			hubName: 'New Hub',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '2 New St'
		});

		await User.collection.insertOne({
			firstName: 'Test',
			locationObjectId: oldHub._id
		});
		await Seed.create([
			{ surveyCode: 'aaaa0001', locationObjectId: oldHub._id },
			{ surveyCode: 'bbbb0002', locationObjectId: newHub._id }
		]);
		await Survey.collection.insertMany([
			{
				surveyCode: 'aaaa0001',
				locationObjectId: oldHub._id,
				responses: { location: oldHub._id.toString(), q: 'kept' },
				deletedAt: null
			},
			{
				surveyCode: 'cccc0003',
				locationObjectId: oldHub._id,
				responses: { location: oldHub._id.toString() },
				deletedAt: new Date() // soft-deleted surveys still count
			},
			{
				surveyCode: 'bbbb0002',
				locationObjectId: newHub._id,
				responses: { location: newHub._id.toString() }
			}
		]);
	});

	test('counts seeds, users and surveys, including soft-deleted surveys', async () => {
		expect(await countLocationReferences(oldHub._id)).toEqual({
			seeds: 1,
			users: 1,
			surveys: 2
		});
	});

	test('moves every reference and the survey location answer', async () => {
		const moved = await reassignLocationReferences(oldHub._id, newHub._id);

		expect(moved).toEqual({
			seeds: 1,
			users: 1,
			surveys: 2,
			surveyAnswers: 2
		});
		expect(await countLocationReferences(oldHub._id)).toEqual({
			seeds: 0,
			users: 0,
			surveys: 0
		});
		expect(await countLocationReferences(newHub._id)).toEqual({
			seeds: 2,
			users: 1,
			surveys: 3
		});

		const survey = await Survey.collection.findOne({
			surveyCode: 'aaaa0001'
		});
		expect(survey?.locationObjectId).toEqual(newHub._id);
		expect(survey?.responses).toEqual({
			location: newHub._id.toString(),
			q: 'kept'
		});
	});

	test('leaves records at other locations alone', async () => {
		const other = await Location.create({
			hubName: 'Other Hub',
			hubType: HubType.ESTABLISHMENT,
			locationType: LocationType.ROOFTOP,
			address: '3 Other St'
		});
		await reassignLocationReferences(oldHub._id, other._id);

		const untouched = await Survey.collection.findOne({
			surveyCode: 'bbbb0002'
		});
		expect(untouched?.locationObjectId).toEqual(newHub._id);
		expect(untouched?.responses).toEqual({
			location: newHub._id.toString()
		});
	});
});
