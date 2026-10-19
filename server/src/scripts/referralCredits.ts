/**
 * Referral credit: a participant earns one credit for each completed survey taken
 * with one of the referral coupons (child survey codes) they were handed.
 *
 * Pure logic only, so it can be tested without a database. The script that reads
 * the database and writes the spreadsheet is referralCreditReport.ts.
 */

export interface ReferralSurvey {
	surveyCode: string;
	parentSurveyCode: string;
	childSurveyCodes: string[];
	responses?: Record<string, unknown> | null;
	isCompleted?: boolean | null;
	createdAt?: Date | string | null;
	locationObjectId?: unknown;
}

export interface ReferralLocation {
	hubName: string;
	address: string;
}

export interface ReferralCreditRow {
	surveyCode: string;
	firstNameLetters: string;
	lastNameLetters: string;
	initials: string;
	dateOfBirth: string;
	surveyLocation: string;
	surveyLocationAddress: string;
	surveyDate: string;
	email: string;
	phone: string;
	referralCredits: number;
	referralsNotCompleted: number;
	creditedSurveyCodes: string;
}

export const REFERRAL_CREDIT_COLUMNS: { key: keyof ReferralCreditRow; header: string }[] = [
	{ key: 'surveyCode', header: 'Survey code' },
	{ key: 'initials', header: 'Initials (first 2 letters of first + last name)' },
	{ key: 'firstNameLetters', header: 'First name letters' },
	{ key: 'lastNameLetters', header: 'Last name letters' },
	{ key: 'dateOfBirth', header: 'Date of birth' },
	{ key: 'surveyLocation', header: 'Survey location' },
	{ key: 'surveyLocationAddress', header: 'Survey location address' },
	{ key: 'surveyDate', header: 'Survey date' },
	{ key: 'email', header: 'Email' },
	{ key: 'phone', header: 'Phone' },
	{ key: 'referralCredits', header: 'Referral credits (completed referrals)' },
	{ key: 'referralsNotCompleted', header: 'Referrals started, not completed' },
	{ key: 'creditedSurveyCodes', header: 'Credited referral survey codes' }
];

const text = (value: unknown): string =>
	value === undefined || value === null ? '' : String(value).trim();

const formatDate = (value: unknown): string => {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? text(value) : date.toISOString().slice(0, 10);
};

/**
 * One row per participant with at least one referral credit, most credits first.
 * `surveys` must already exclude deleted surveys.
 */
export function buildReferralCreditRows(
	surveys: ReferralSurvey[],
	locationsById: Map<string, ReferralLocation>
): ReferralCreditRow[] {
	const childrenByParent = new Map<string, ReferralSurvey[]>();
	for (const survey of surveys) {
		const siblings = childrenByParent.get(survey.parentSurveyCode) ?? [];
		siblings.push(survey);
		childrenByParent.set(survey.parentSurveyCode, siblings);
	}

	const rows: ReferralCreditRow[] = [];
	for (const survey of surveys) {
		// Only surveys taken with one of this participant's coupons count
		const coupons = new Set(survey.childSurveyCodes ?? []);
		const referred = (childrenByParent.get(survey.surveyCode) ?? []).filter(child =>
			coupons.has(child.surveyCode)
		);
		const completed = referred.filter(child => child.isCompleted === true);
		if (completed.length === 0) continue;

		const responses = survey.responses ?? {};
		const firstNameLetters = text(responses.first_two_letters_fname).toUpperCase();
		const lastNameLetters = text(responses.first_two_letters_lname).toUpperCase();
		const location = locationsById.get(text(survey.locationObjectId));

		rows.push({
			surveyCode: survey.surveyCode,
			firstNameLetters,
			lastNameLetters,
			initials: `${firstNameLetters}${lastNameLetters}`,
			dateOfBirth: text(responses.date_of_birth), // as entered; no timezone conversion
			surveyLocation: location?.hubName ?? '',
			surveyLocationAddress: location?.address ?? '',
			surveyDate: formatDate(survey.createdAt),
			email: text(responses.email),
			phone: text(responses.phone),
			referralCredits: completed.length,
			referralsNotCompleted: referred.length - completed.length,
			creditedSurveyCodes: completed.map(child => child.surveyCode).join(', ')
		});
	}

	return rows.sort(
		(a, b) => b.referralCredits - a.referralCredits || a.surveyCode.localeCompare(b.surveyCode)
	);
}

const csvCell = (value: string | number): string => {
	const s = String(value);
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a byte-order mark so Excel opens names and addresses correctly. */
export function toCsv(rows: ReferralCreditRow[]): string {
	const lines = [REFERRAL_CREDIT_COLUMNS.map(c => csvCell(c.header)).join(',')];
	for (const row of rows) {
		lines.push(REFERRAL_CREDIT_COLUMNS.map(c => csvCell(row[c.key])).join(','));
	}
	return '﻿' + lines.join('\r\n') + '\r\n';
}
