/**
 * Whether a survey's answers allow it to hand out referral coupons.
 *
 * Shared by the server (which rejects codes from ineligible surveys) and the
 * client (which decides between the coupon page and the "Ineligible for
 * referral coupons" page). An ineligible survey still keeps its record, so the
 * attempt is counted, but its coupon codes must never be used.
 *
 * Answer values here must match the choices in the LA survey JSON
 * (client/src/pages/Survey/utils/survey.json).
 */

// Calculated age in the survey is taken as of this date (see yc_age).
export const AGE_REFERENCE_DATE = '2027-01-31';

const SHELTERED = [
	'Emergency shelter',
	'Safe haven',
	'Transitional housing',
	'Youth shelter'
];

const UNSHELTERED = [
	'Street, sidewalk, or alley',
	'Bus or train stop/station',
	'On a bus',
	'On a train',
	'Parking lot (surface)',
	'Parking structure',
	'Airport',
	'Campground or woods',
	'Park, beach, or riverbed',
	'Under bridge or overpass',
	'Abandoned building',
	'Unconverted garage, attic, or basement',
	'Workplace',
	'Other outdoor location',
	'Other place not meant for human habitation',
	'Makeshift shelter',
	'Tent',
	'Car or truck',
	'Van or SUV',
	'RV or camper'
];

const DOUBLED_UP = [
	'Apartment or home of a relative or friend',
	'Apartment or home of a stranger'
];

// "Another housing situation such as a jail/prison or hospital or treatment
// facility".
const OTHER_HOUSING = [
	'Hospital, substance abuse or psychiatric treatment facility',
	'Jail or prison',
	'Foster care, group home, SILP, STRTP',
	'Hotel or motel',
	'Assisted living or Board & Care facility'
];

const OWN_HOME = 'Your own apartment or home';

const normalise = (v: unknown) =>
	typeof v === 'string' ? v.trim().toLowerCase() : '';

const inList = (v: unknown, list: string[]) =>
	list.some(item => item.toLowerCase() === normalise(v));

const noAnswer = (v: unknown) => v === 'Declined' || v === "Don't know";

/** Whole years between a YYYY-MM-DD date of birth and the reference date. */
export function ageOn(dateOfBirth: unknown, onDate = AGE_REFERENCE_DATE) {
	if (typeof dateOfBirth !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
	const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(onDate);
	if (!m || !r) return null;
	let age = Number(r[1]) - Number(m[1]);
	if (
		Number(r[2]) < Number(m[2]) ||
		(Number(r[2]) === Number(m[2]) && Number(r[3]) < Number(m[3]))
	) {
		age -= 1;
	}
	return age;
}

export function isReferralEligible(
	responses: Record<string, unknown> | null | undefined
): boolean {
	if (!responses) return true;

	// Hard stops: no consent, a repeat respondent, or 25 and over.
	if (responses.consent_given === 'No') return false;
	if (responses.deduplication === 'Yes') return false;
	const age = ageOn(responses.date_of_birth);
	if (age !== null && age >= 25) return false;

	const { Q2, Q3 } = responses;
	// Declined or didn't know where they slept, both in the last 30 days and last
	// night: the survey's own complete trigger ends it.
	if (noAnswer(Q2) && noAnswer(Q3)) return false;

	// Before the location questions are answered there is nothing to judge yet,
	// e.g. an older record; keep the previous behaviour and allow it.
	if (Q2 === undefined && Q3 === undefined) return true;

	const either = (list: string[]) => inList(Q2, list) || inList(Q3, list);

	// 1) Unsheltered and 2) sheltered youth.
	if (either(UNSHELTERED) || either(SHELTERED)) return true;

	// 5) Jail or prison, hospital or treatment facility, and other housing.
	if (either(OTHER_HOUSING)) return true;

	const networkSize = Number(responses.non_family_network_size);
	const knowsHomelessYouth = Number.isFinite(networkSize) && networkSize >= 1;

	// 3) Doubled up, if they know one or more homeless youth.
	if (either(DOUBLED_UP)) return knowsHomelessYouth;

	// 4) Own home, if they have a history of homelessness and know one or more
	// homeless youth.
	if (either([OWN_HOME])) {
		const history = Array.isArray(responses.Q415)
			? responses.Q415
			: [responses.Q415];
		const hasHistory = history.some(
			v => typeof v === 'string' && v.startsWith('Yes')
		);
		return hasHistory && knowsHomelessYouth;
	}

	// Anything else (e.g. one answer Declined and the other blank) gets no coupons.
	return false;
}
