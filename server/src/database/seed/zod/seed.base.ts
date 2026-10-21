import { Types } from 'mongoose';
import { z } from 'zod';

import {
	isValidSurveyCodeFormat,
	SURVEY_CODE_FORMAT_MESSAGE
} from '../../utils/constants';
import Seed from '../mongoose/seed.model';

export const baseSeedSchema = z
	.object({
		surveyCode: z
			.string()
			.refine(
				isValidSurveyCodeFormat,
				`Survey code ${SURVEY_CODE_FORMAT_MESSAGE}`
			),
		locationObjectId: z
			.string()
			.refine(Types.ObjectId.isValid, 'Invalid location objectId'),
		isFallback: z.boolean().optional()
	})
	.meta({ model: Seed });
