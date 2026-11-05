import {
	Model,
	PageModel,
	QuestionPanelDynamicModel,
	QuestionSelectBase
} from 'survey-core';
// registers SurveyJS's Spanish strings (buttons, validation messages) for locale 'es'
import 'survey-core/i18n/spanish';

import { SurveyDocument } from '@/types/Survey';

import { isTestEnvironment } from '@/utils/environment';

import surveyJsonData from './survey.json';
import { themeJson } from './surveyTheme';

// SurveyJS refuses to move on when someone picks "Other" and writes nothing, and
// offers no setting to change it: the "Other" item is hard-coded comment-required, and
// questions built as the respondent goes (repeating sections, table rows) rebuild it.
// The write-in is optional everywhere, so switch off the single check that
// raises that error - `hasEmptyComments` is used for nothing else in survey-core.
const selectBaseProto = QuestionSelectBase.prototype as unknown as {
	hasEmptyComments?: () => boolean;
};
if (typeof selectBaseProto.hasEmptyComments === 'function') {
	selectBaseProto.hasEmptyComments = () => false;
} else {
	console.warn(
		'survey-core no longer has hasEmptyComments: "Other" answers may again require text'
	);
}

/**
 * Answer key holding the page a survey was last left on. It is stored with the
 * answers so a survey continued later - possibly on another tablet - reopens where
 * the interviewer stopped, instead of back at the first page.
 */
export const LAST_PAGE_KEY = 'last_page_name';

/**
 * Answer key holding the language the respondent chose. Question text carries an
 * English default and a Spanish ("es") version; answers are stored in English either way.
 */
export const LANGUAGE_KEY = 'survey_language';

const applySurveyLanguage = (survey: Model) => {
	survey.locale = survey.getValue(LANGUAGE_KEY) === 'es' ? 'es' : '';
};

/**
 * Household counts (question 28) and the entry sections they drive. Each
 * section must end up with one entry per person counted; the survey JSON's
 * validators enforce that, and this keeps the number of entries in step so the
 * interviewer only has to fill them in.
 */
const HOUSEHOLD_ENTRY_SECTIONS: Record<string, string> = {
	Q23_U18: 'household_children',
	Q23_18p: 'household_adults'
};

const syncHouseholdEntries = (survey: Model, countName: string) => {
	const section = survey.getQuestionByName(
		HOUSEHOLD_ENTRY_SECTIONS[countName]
	) as QuestionPanelDynamicModel | null;
	if (!section) return;
	const count = Number(survey.getValue(countName));
	const target = Number.isFinite(count)
		? Math.min(Math.max(Math.floor(count), 0), section.maxPanelCount)
		: 0;
	// Add entries up to the count.
	if (section.panelCount < target) section.panelCount = target;
	// When the count goes down, drop trailing entries nobody has started; an entry
	// with answers is left for the interviewer to remove.
	while (section.panelCount > target) {
		const last = section.panels[section.panelCount - 1];
		if (!last || Object.keys(last.getValue() ?? {}).length > 0) break;
		section.removePanel(last, false);
	}
};

/**
 * Switches the survey's language whenever the language answer changes, and keeps
 * the household entry sections in step with the household counts. Exported so
 * the survey page can re-attach it after clearing its own value handlers.
 */
export const attachLanguageHandler = (survey: Model) => {
	survey.onValueChanged.add((sender, options) => {
		if (options.name === LANGUAGE_KEY) applySurveyLanguage(sender);
		if (options.name in HOUSEHOLD_ENTRY_SECTIONS)
			syncHouseholdEntries(sender, options.name);
	});
};

const restoreLastPage = (survey: Model) => {
	const pageName = survey.data?.[LAST_PAGE_KEY];
	if (typeof pageName !== 'string') return;
	const page = survey.getPageByName(pageName);
	if (page && page.isVisible) {
		survey.currentPage = page;
	}
};

/**
 * Answer key listing questions the respondent was asked but left unanswered.
 * SurveyJS drops empty values from the answers entirely, so a skipped question and a
 * question never reached look identical. Recording the skips keeps a continued survey
 * from treating an intentionally blank page as one nobody has been through yet.
 */
export const SKIPPED_KEY = 'skipped_questions';

const SKIP_EXEMPT_TYPES = ['paneldynamic', 'matrixdynamic', 'matrixdropdown'];

/** Note every question left empty on the page being left behind. */
export const recordSkippedAnswers = (
	survey: Model,
	page: PageModel | null | undefined
) => {
	if (!page) return;

	const skippedNow = page.questions
		.filter(
			question =>
				question.isVisible &&
				!question.isReadOnly &&
				question.isEmpty() &&
				!SKIP_EXEMPT_TYPES.includes(question.getType())
		)
		.map(question => question.name);

	const previous: string[] = Array.isArray(survey.data?.[SKIPPED_KEY])
		? survey.data[SKIPPED_KEY]
		: [];
	// drop anything since answered, so the list always reflects the current answers
	const stillSkipped = previous.filter(name => {
		const question = survey.getQuestionByName(name);
		return !question || question.isEmpty();
	});
	const merged = Array.from(new Set([...stillSkipped, ...skippedNow])).sort();

	if (merged.length > 0 || previous.length > 0) {
		survey.setValue(SKIPPED_KEY, merged);
	}
};

// Helper function to initialize survey with or without existing data
export const initializeSurvey = (
	surveyByRefCode: SurveyDocument | null,
	surveyByObjectId: SurveyDocument | null,
	parentSurvey: SurveyDocument | null,
	isEditMode: boolean = false,
	editMode: string | null = null
) => {
	// Clone the survey JSON to avoid mutating the original
	const surveyJson = JSON.parse(JSON.stringify(surveyJsonData));

	if (isEditMode) {
		let pageNames: string[] = [];
		let title = 'Homelessness Experience Survey (Edit Mode)';

		// Determine which pages to show based on edit mode
		if (editMode === 'details') {
			// Edit Survey Details
			title = 'Edit Survey Details';
			pageNames = [
				'volunteer-pre-screen',
				'age_check',
				'consent',
				'survey-validation',
			];
		} else if (editMode === 'giftcard') {
			// Edit Gift Card Information
			title = 'Edit Gift Card Information';
			pageNames = ['giftCards', 'giftCards2'];
		} else if (editMode === 'feedback') {
			// Leave Feedback
			title = 'Leave Feedback';
			pageNames = ['end_page'];
		} else {
			// Default: all edit pages
			pageNames = [
				'volunteer-pre-screen',
				'age_check',
				'consent',
				'survey-validation',
				'giftCards',
				'giftCards2',
				'end_page',
			];
		}

		surveyJson.title = title;
		surveyJson.pages = surveyJson.pages.filter((page: any) =>
			pageNames.includes(page.name)
		);

		// Repeat respondents skip the gift card pages during the survey, but staff
		// can still add a gift card afterwards (e.g. to settle a tense situation).
		surveyJson.pages.forEach((page: any) => {
			if (page.name === 'giftCards' || page.name === 'giftCards2') {
				delete page.visibleIf;
			}
		});

		// Remove any early stop triggers to allow full editing of survey
		// Without this, the survey will stop early if consent is revoked, not allowing any edits to consecutive pages
		if (surveyJson.triggers) {
			delete surveyJson.triggers;
		}
	}

	const survey = new Model(surveyJson);
	// drives the test-only warning page at the start of the survey
	survey.setVariable('is_test_environment', isTestEnvironment());

	// Apply custom theme
	survey.applyTheme(themeJson);

	attachLanguageHandler(survey);

	// Populate with existing data from objectId if found
	if (surveyByObjectId) {
		survey.data = surveyByObjectId.responses;
		applySurveyLanguage(survey);
		if (!isEditMode) restoreLastPage(survey);
		return {
			survey,
			existingData: {
				surveyData: surveyByObjectId,
				objectId: surveyByObjectId._id,
				parentSurveyCode: surveyByObjectId.parentSurveyCode
			}
		};
	}
	// Populate with existing data from coupon code if found
	else if (surveyByRefCode) {
		survey.data = surveyByRefCode.responses;
		applySurveyLanguage(survey);
		if (!isEditMode) restoreLastPage(survey);
		return {
			survey,
			existingData: {
				surveyData: surveyByRefCode,
				objectId: surveyByRefCode._id,
				parentSurveyCode: parentSurvey?.surveyCode
			}
		};
	}

	// No existing data found, return blank new survey

	survey.data = {};
	return { survey, existingData: null };
};
