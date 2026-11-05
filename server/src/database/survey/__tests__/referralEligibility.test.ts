import { describe, expect, test } from '@jest/globals';

import { isReferralEligible } from '../referralEligibility';

describe('isReferralEligible', () => {
	test('a consenting first-time respondent is eligible', () => {
		expect(
			isReferralEligible({ consent_given: 'Yes', deduplication: 'No' })
		).toBe(true);
	});

	test('declining consent makes the survey ineligible', () => {
		expect(isReferralEligible({ consent_given: 'No' })).toBe(false);
	});

	test('having already taken the survey makes it ineligible', () => {
		expect(
			isReferralEligible({ consent_given: 'Yes', deduplication: 'Yes' })
		).toBe(false);
	});

	test('"Do not know" on the repeat question stays eligible', () => {
		expect(
			isReferralEligible({
				consent_given: 'Yes',
				deduplication: 'Do not know'
			})
		).toBe(true);
	});

	test('missing answers are treated as eligible', () => {
		expect(isReferralEligible(undefined)).toBe(true);
		expect(isReferralEligible({})).toBe(true);
	});
});
