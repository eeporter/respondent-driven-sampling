/**
 * Find and move the records that point at a location, so a location can be
 * retired without orphaning seeds, users or surveys. Used by locationCRUD.ts.
 */
import { Types } from 'mongoose';

import Seed from '@/database/seed/mongoose/seed.model';
import Survey from '@/database/survey/mongoose/survey.model';
import User from '@/database/user/mongoose/user.model';

export interface LocationReferences {
	seeds: number;
	users: number;
	surveys: number;
}

/** Count seeds, users and surveys (including soft-deleted ones) at a location. */
export async function countLocationReferences(
	locationId: Types.ObjectId
): Promise<LocationReferences> {
	const [seeds, users, surveys] = await Promise.all([
		Seed.collection.countDocuments({ locationObjectId: locationId }),
		User.collection.countDocuments({ locationObjectId: locationId }),
		Survey.collection.countDocuments({ locationObjectId: locationId })
	]);
	return { seeds, users, surveys };
}

/**
 * Point every seed, user and survey at `toId` instead of `fromId`, including the
 * survey's own `responses.location` answer.
 *
 * Writes go through the raw collections on purpose: `locationObjectId` is
 * immutable on seeds and surveys, which is right for the app but would block
 * this one-off data fix.
 */
export async function reassignLocationReferences(
	fromId: Types.ObjectId,
	toId: Types.ObjectId
): Promise<LocationReferences & { surveyAnswers: number }> {
	const [seeds, users, surveys, surveyAnswers] = await Promise.all([
		Seed.collection.updateMany(
			{ locationObjectId: fromId },
			{ $set: { locationObjectId: toId } }
		),
		User.collection.updateMany(
			{ locationObjectId: fromId },
			{ $set: { locationObjectId: toId } }
		),
		Survey.collection.updateMany(
			{ locationObjectId: fromId },
			{ $set: { locationObjectId: toId } }
		),
		// The survey form stores the chosen location's id as a string
		Survey.collection.updateMany(
			{ 'responses.location': { $in: [fromId.toString(), fromId] } },
			{ $set: { 'responses.location': toId.toString() } }
		)
	]);
	return {
		seeds: seeds.modifiedCount,
		users: users.modifiedCount,
		surveys: surveys.modifiedCount,
		surveyAnswers: surveyAnswers.modifiedCount
	};
}
