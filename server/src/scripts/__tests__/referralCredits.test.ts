import { describe, expect, test } from '@jest/globals';

import {
	buildReferralCreditRows,
	ReferralLocation,
	ReferralSurvey,
	toCsv
} from '../referralCredits';

const locations = new Map<string, ReferralLocation>([
	['loc1', { hubName: 'Moses Lake Public Library', address: '418 E 5th Avenue, Moses Lake, WA' }]
]);

const survey = (overrides: Partial<ReferralSurvey>): ReferralSurvey => ({
	surveyCode: 'X',
	parentSurveyCode: '__SEED__',
	childSurveyCodes: [],
	responses: {},
	isCompleted: true,
	createdAt: new Date('2026-09-17T18:00:00Z'),
	locationObjectId: 'loc1',
	...overrides
});

describe('buildReferralCreditRows', () => {
	const parent = survey({
		surveyCode: 'AAA',
		childSurveyCodes: ['C1', 'C2', 'C3'],
		responses: {
			first_two_letters_fname: 'jo',
			first_two_letters_lname: 'sm',
			date_of_birth: '1980-05-03',
			email: 'person@example.org',
			phone: '5095550100'
		}
	});

	test('counts only completed surveys taken with the participant’s coupons', () => {
		const rows = buildReferralCreditRows(
			[
				parent,
				survey({ surveyCode: 'C1', parentSurveyCode: 'AAA' }),
				survey({ surveyCode: 'C2', parentSurveyCode: 'AAA', isCompleted: false }),
				survey({ surveyCode: 'C3', parentSurveyCode: 'AAA' })
			],
			locations
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			surveyCode: 'AAA',
			initials: 'JOSM',
			dateOfBirth: '1980-05-03',
			surveyLocation: 'Moses Lake Public Library',
			surveyDate: '2026-09-17',
			email: 'person@example.org',
			phone: '5095550100',
			referralCredits: 2,
			referralsNotCompleted: 1,
			creditedSurveyCodes: 'C1, C3'
		});
	});

	test('leaves out participants with no completed referrals and blanks missing contact info', () => {
		const rows = buildReferralCreditRows(
			[
				survey({ surveyCode: 'NOCRED', childSurveyCodes: ['Z1'] }),
				survey({ surveyCode: 'Z1', parentSurveyCode: 'NOCRED', isCompleted: false }),
				survey({ surveyCode: 'BBB', childSurveyCodes: ['D1'] }),
				survey({ surveyCode: 'D1', parentSurveyCode: 'BBB' })
			],
			locations
		);

		expect(rows.map(r => r.surveyCode)).toEqual(['BBB']);
		expect(rows[0].email).toBe('');
		expect(rows[0].phone).toBe('');
	});

	test('sorts by most credits first', () => {
		const rows = buildReferralCreditRows(
			[
				survey({ surveyCode: 'ONE', childSurveyCodes: ['O1'] }),
				survey({ surveyCode: 'O1', parentSurveyCode: 'ONE' }),
				survey({ surveyCode: 'TWO', childSurveyCodes: ['T1', 'T2'] }),
				survey({ surveyCode: 'T1', parentSurveyCode: 'TWO' }),
				survey({ surveyCode: 'T2', parentSurveyCode: 'TWO' })
			],
			locations
		);

		expect(rows.map(r => r.surveyCode)).toEqual(['TWO', 'ONE']);
	});
});

describe('toCsv', () => {
	test('quotes cells with commas and starts with a byte-order mark', () => {
		const [row] = buildReferralCreditRows(
			[
				survey({ surveyCode: 'AAA', childSurveyCodes: ['C1'] }),
				survey({ surveyCode: 'C1', parentSurveyCode: 'AAA' })
			],
			locations
		);
		const csv = toCsv([row]);

		expect(csv.startsWith('﻿Survey code,')).toBe(true);
		expect(csv).toContain('"418 E 5th Avenue, Moses Lake, WA"');
	});
});
