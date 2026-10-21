import { describe, expect, test } from '@jest/globals';

import { isValidSurveyCodeFormat, normalizeSurveyCode } from '../constants';

describe('survey code format', () => {
	test("adds the '@' when a typed code leaves it off", () => {
		expect(normalizeSurveyCode(' 3f9a 0c1b ')).toBe('@3F9A0C1B');
		expect(normalizeSurveyCode('@3f9a0c1b')).toBe('@3F9A0C1B');
	});

	test("accepts '@' codes and older 8-character codes only", () => {
		expect(isValidSurveyCodeFormat('@3F9A0C1B')).toBe(true);
		expect(isValidSurveyCodeFormat('3F9A0C1B')).toBe(true);
		expect(isValidSurveyCodeFormat('13F9A0C1B')).toBe(false);
		expect(isValidSurveyCodeFormat('@3F9A0C1')).toBe(false);
	});
});
