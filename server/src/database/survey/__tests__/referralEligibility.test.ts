import { describe, expect, test } from '@jest/globals';

import { ageOn, isReferralEligible } from '../referralEligibility';

const base = {
	consent_given: 'Yes',
	is_under_25: 'Yes',
	date_of_birth: '2006-06-15',
	deduplication: 'No'
};

describe('isReferralEligible', () => {
	test('1) unsheltered youth are eligible', () => {
		expect(
			isReferralEligible({ ...base, Q2: 'Tent', Q3: 'Car or truck' })
		).toBe(true);
	});

	test('2) sheltered youth are eligible', () => {
		expect(
			isReferralEligible({
				...base,
				Q2: 'Emergency shelter',
				Q3: 'Youth shelter'
			})
		).toBe(true);
	});

	test('either location item being homeless is enough', () => {
		expect(
			isReferralEligible({
				...base,
				Q2: 'Your own apartment or home',
				Q3: 'Parking lot (Surface)'
			})
		).toBe(true);
	});

	test('3) doubled up youth need to know a homeless youth', () => {
		const doubledUp = {
			...base,
			Q2: 'Apartment or home of a relative or friend',
			Q3: 'Apartment or home of a stranger'
		};
		expect(
			isReferralEligible({ ...doubledUp, non_family_network_size: 2 })
		).toBe(true);
		expect(
			isReferralEligible({ ...doubledUp, non_family_network_size: '1' })
		).toBe(true);
		expect(
			isReferralEligible({ ...doubledUp, non_family_network_size: 0 })
		).toBe(false);
	});

	test('4) youth in their own home need a history and a homeless contact', () => {
		const ownHome = {
			...base,
			Q2: 'Your own apartment or home',
			Q3: 'Your own apartment or home'
		};
		const history = [
			'Yes, sheltered (e.g., emergency shelter, transitional housing, or safe haven)'
		];
		expect(
			isReferralEligible({
				...ownHome,
				Q415: history,
				non_family_network_size: 1
			})
		).toBe(true);
		expect(
			isReferralEligible({
				...ownHome,
				Q415: history,
				non_family_network_size: 0
			})
		).toBe(false);
		expect(
			isReferralEligible({
				...ownHome,
				Q415: ['No, I have never experienced homelessness'],
				non_family_network_size: 3
			})
		).toBe(false);
		expect(
			isReferralEligible({
				...ownHome,
				Q415: ["Declined / Don't know"],
				non_family_network_size: 3
			})
		).toBe(false);
	});

	test('5) jail, hospital or other housing is eligible', () => {
		expect(
			isReferralEligible({
				...base,
				Q2: 'Jail or prison',
				Q3: 'Jail or prison'
			})
		).toBe(true);
		expect(
			isReferralEligible({
				...base,
				Q2: 'Hospital, substance abuse or psychiatric treatment facility',
				Q3: 'Declined'
			})
		).toBe(true);
	});

	test('declining consent makes the survey ineligible', () => {
		expect(isReferralEligible({ ...base, consent_given: 'No' })).toBe(
			false
		);
	});

	test('having already taken the survey makes it ineligible', () => {
		expect(
			isReferralEligible({ ...base, Q2: 'Tent', deduplication: 'Yes' })
		).toBe(false);
	});

	test('25 and over is ineligible, by screening answer or date of birth', () => {
		expect(
			isReferralEligible({ ...base, Q2: 'Tent', is_under_25: 'No' })
		).toBe(false);
		expect(
			isReferralEligible({
				...base,
				Q2: 'Tent',
				date_of_birth: '2002-01-31'
			})
		).toBe(false);
		expect(
			isReferralEligible({
				...base,
				Q2: 'Tent',
				date_of_birth: '2002-02-01'
			})
		).toBe(true);
	});

	test('declining or not knowing both location items makes it ineligible', () => {
		expect(
			isReferralEligible({ ...base, Q2: 'Declined', Q3: "Don't know" })
		).toBe(false);
	});

	test('a record with no answers yet is not blocked', () => {
		expect(isReferralEligible(undefined)).toBe(true);
		expect(isReferralEligible({})).toBe(true);
	});
});

describe('ageOn', () => {
	test('counts whole years up to the reference date', () => {
		expect(ageOn('2002-01-31')).toBe(25);
		expect(ageOn('2002-02-01')).toBe(24);
		expect(ageOn(undefined)).toBe(null);
	});
});
