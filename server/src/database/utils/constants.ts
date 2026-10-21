// ---- SURVEY CONSTANTS ----

export const SYSTEM_SURVEY_CODE = '__SEED__';
export const GENERATED_SURVEY_CODES_LENGTH = 3;
// Codes are '@' followed by 8 characters, e.g. @3F9A0C1B (Contra Costa asked for the '@')
export const SURVEY_CODE_PREFIX = '@';
export const SURVEY_CODE_LENGTH = 9;
// codes handed out before the '@' prefix still exist in the database
export const LEGACY_SURVEY_CODE_LENGTH = 8;
export const SURVEY_CODE_FORMAT_MESSAGE = `must be ${SURVEY_CODE_PREFIX} followed by ${SURVEY_CODE_LENGTH - SURVEY_CODE_PREFIX.length} characters`;

export const isValidSurveyCodeFormat = (code: string) =>
	code.startsWith(SURVEY_CODE_PREFIX)
		? code.length === SURVEY_CODE_LENGTH
		: code.length === LEGACY_SURVEY_CODE_LENGTH;

/** Tidy a typed code: uppercase, no spaces, and the '@' added if it was left off. */
export const normalizeSurveyCode = (code: string) => {
	const tidy = code.replace(/\s+/g, '').toUpperCase();
	return tidy.length === SURVEY_CODE_LENGTH - SURVEY_CODE_PREFIX.length &&
		!tidy.startsWith(SURVEY_CODE_PREFIX)
		? SURVEY_CODE_PREFIX + tidy
		: tidy;
};

// ---- LOCATION CONSTANTS ----

export enum HubType {
	ESTABLISHMENT = 'ESTABLISHMENT',
	STREET_ADDRESS = 'STREET_ADDRESS',
	PREMISE = 'PREMISE',
	CHURCH = 'CHURCH',
	LOCALITY = 'LOCALITY'
}

export enum LocationType {
	ROOFTOP = 'ROOFTOP',
	APPROXIMATE = 'APPROXIMATE'
}

// ---- USER CONSTANTS ----

export enum ApprovalStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED'
}
