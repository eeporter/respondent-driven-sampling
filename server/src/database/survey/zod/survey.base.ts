import { Types } from 'mongoose';
import { z } from 'zod';

import Survey from '@/database/survey/mongoose/survey.model';
import {
	GENERATED_SURVEY_CODES_LENGTH,
	isValidSurveyCodeFormat,
	SURVEY_CODE_FORMAT_MESSAGE
} from '@/database/utils/constants';

// Base field definitions - reusable across all survey schemas
export const baseSurveySchema = z
	.object({
		surveyCode: z
			.string()
			.refine(
				isValidSurveyCodeFormat,
				`Survey code ${SURVEY_CODE_FORMAT_MESSAGE}`
			),

		parentSurveyCode: z
			.string()
			.refine(
				isValidSurveyCodeFormat,
				`Referral survey code ${SURVEY_CODE_FORMAT_MESSAGE}`
			),

		childSurveyCodes: z
			.array(
				z
					.string()
					.refine(
						isValidSurveyCodeFormat,
						`Child survey code ${SURVEY_CODE_FORMAT_MESSAGE}`
					)
			)
			.length(
				GENERATED_SURVEY_CODES_LENGTH,
				`Must have exactly ${GENERATED_SURVEY_CODES_LENGTH} generated survey codes`
			)
			.refine(codes => new Set(codes).size === codes.length, {
				message: 'Child survey codes must be unique within the array'
			}),

		createdByUserObjectId: z
			.string()
			.refine(Types.ObjectId.isValid, 'Invalid user objectId'),

		responses: z
			.record(z.string(), z.any())
			.refine(data => Object.keys(data).length > 0, {
				message: 'Responses must contain at least one response'
			}),

		isCompleted: z.boolean().optional(),

		coordinates: z
			.object({
				latitude: z.number().min(-90).max(90),
				longitude: z.number().min(-180).max(180)
			})
			.optional(),

		locationObjectId: z
			.string()
			.refine(Types.ObjectId.isValid, 'Invalid location objectId'),

		createdAt: z.coerce.date(),
		updatedAt: z.coerce.date()
	})
	// Refinements across all fields
	.refine(data => data.parentSurveyCode !== data.surveyCode, {
		message: 'Cannot use same survey code to refer to itself'
	})
	.meta({ model: Survey });
