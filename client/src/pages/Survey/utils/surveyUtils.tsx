import { isTestEnvironment } from '@/utils/environment';
import { Model, PageModel, QuestionSelectBase } from 'survey-core';

import { SurveyDocument } from '@/types/Survey';

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

const restoreLastPage = (survey: Model) => {
	const pageName = survey.data?.[LAST_PAGE_KEY];
	if (typeof pageName !== 'string') return;
	const page = survey.getPageByName(pageName);
	if (page && page.isVisible) {
		survey.currentPage = page;
	}
};

/**
 * Answer key set on surveys started without a referral or seed coupon. Questions
 * meant only for those respondents (such as how they heard about the survey) show
 * on `{started_without_coupon} = true`.
 */
export const STARTED_WITHOUT_COUPON_KEY = 'started_without_coupon';

/**
 * Answer key listing questions the respondent was asked but left unanswered.
 * SurveyJS drops empty values from the answers entirely, so a skipped question and a
 * question never reached look identical. Recording the skips keeps a continued survey
 * from treating an intentionally blank page as one nobody has been through yet.
 */
export const SKIPPED_KEY = 'skipped_questions';

const SKIP_EXEMPT_TYPES = ['paneldynamic', 'matrixdynamic', 'matrixdropdown'];

/**
 * Let a selected radio answer be cleared by clicking it again. SurveyJS radio
 * groups cannot be un-answered once tapped, which strands a mistaken tap on an
 * optional question. The selection is read on pointerdown because by the time
 * the click arrives the browser has already marked the radio as checked.
 */
export const enableRadioDeselect = (survey: Model) => {
	survey.onAfterRenderQuestion.add((_, { question, htmlElement }) => {
		if (question.getType() !== 'radiogroup') return;

		const radioFor = (target: EventTarget | null) =>
			(target as HTMLElement | null)
				?.closest('label')
				?.querySelector<HTMLInputElement>('input[type="radio"]') ??
			null;

		let clickedSelected = false;
		htmlElement.addEventListener('pointerdown', event => {
			const radio = radioFor(event.target);
			clickedSelected =
				!!radio &&
				!question.isEmpty() &&
				radio.value === String(question.value);
		});
		htmlElement.addEventListener('click', event => {
			if (!clickedSelected || !radioFor(event.target)) return;
			clickedSelected = false;
			// stop the label re-checking the radio, then clear the answer
			event.preventDefault();
			question.clearValue();
		});
	});
};

/**
 * Keep number boxes from ever holding a negative value. The spinner is stopped at
 * zero with `min`, and the minus sign (plus "e" and "+", which would let one in
 * as an exponent) is refused when typed or pasted. Covers every number box a
 * question renders, including the ones inside multiple-text questions.
 */
export const enableNonNegativeNumbers = (survey: Model) => {
	const blocked = ['-', '+', 'e', 'E'];
	survey.onAfterRenderQuestion.add((_, { htmlElement }) => {
		htmlElement
			.querySelectorAll<HTMLInputElement>('input[type="number"]')
			.forEach(input => {
				if (!input.min || Number(input.min) < 0) input.min = '0';
			});
		htmlElement.addEventListener('keydown', event => {
			const target = event.target as HTMLInputElement;
			if (target.type === 'number' && blocked.includes(event.key)) {
				event.preventDefault();
			}
		});
		htmlElement.addEventListener('paste', event => {
			const target = event.target as HTMLInputElement;
			const text = event.clipboardData?.getData('text') ?? '';
			if (
				target.type === 'number' &&
				blocked.some(c => text.includes(c))
			) {
				event.preventDefault();
			}
		});
	});
};

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
		let title = '2026 Youth Housing Survey (Edit Mode)';

		// Determine which pages to show based on edit mode
		if (editMode === 'details') {
			// Edit Survey Details
			title = 'Edit Survey Details';
			pageNames = [
				'volunteer-pre-screen',
				'age_check',
				'consent',
				'survey-validation'
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
				'end_page'
			];
		}

		surveyJson.title = title;
		surveyJson.pages = surveyJson.pages.filter((page: any) =>
			pageNames.includes(page.name)
		);

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

	// Populate with existing data from objectId if found
	if (surveyByObjectId) {
		survey.data = surveyByObjectId.responses;
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
