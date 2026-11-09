import { useEffect, useState } from 'react';

import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle
} from '@mui/material';
import { Model } from 'survey-core';

/** Answer keys recording that the respondent chose to stop, and where. */
export const ENDED_EARLY_KEY = 'ended_early';
export const ENDED_EARLY_PAGE_KEY = 'ended_early_page';

// The button is offered on every page after the consent page, until the
// closing pages are reached.
const CONSENT_PAGE = 'consent';
export const END_EARLY_TARGET_PAGE = 'outro';

const isOfferedOn = (survey: Model) => {
	const pages = survey.visiblePages;
	const current = survey.currentPageNo;
	const consent = pages.findIndex(p => p.name === CONSENT_PAGE);
	const target = pages.findIndex(p => p.name === END_EARLY_TARGET_PAGE);
	return (
		consent !== -1 && target !== -1 && current > consent && current < target
	);
};

/**
 * "End survey early" for a respondent who no longer wants to continue. After a
 * confirmation, the answers so far are kept and the survey jumps to the closing
 * pages (outro, gift cards), then finishes on the coupon page as usual.
 */
const EndSurveyEarly = ({ survey }: { survey: Model }) => {
	const [offered, setOffered] = useState(() => isOfferedOn(survey));
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const update = () => setOffered(isOfferedOn(survey));
		survey.onCurrentPageChanged.add(update);
		return () => survey.onCurrentPageChanged.remove(update);
	}, [survey]);

	const endNow = () => {
		const target = survey.getPageByName(END_EARLY_TARGET_PAGE);
		setOpen(false);
		if (!target) return;
		survey.setValue(ENDED_EARLY_KEY, true);
		survey.setValue(ENDED_EARLY_PAGE_KEY, survey.currentPage?.name);
		survey.currentPage = target;
		window.scrollTo({ top: 0 });
	};

	if (!offered) return null;

	return (
		<>
			<Box sx={{ display: 'flex', justifyContent: 'flex-end', my: 1.5 }}>
				<Button
					variant="contained"
					color="error"
					size="large"
					onClick={() => setOpen(true)}
					sx={{ fontWeight: 700, px: 3, boxShadow: 3 }}
				>
					End survey early
				</Button>
			</Box>
			<Dialog open={open} onClose={() => setOpen(false)}>
				<DialogTitle>End the survey early?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						The respondent is choosing to end the survey before
						finishing all of the questions. The answers given so far
						will be saved, and the remaining questions will be
						skipped. You will go straight to the gift card pages and
						then the referral coupon page.
					</DialogContentText>
					<DialogContentText sx={{ mt: 2, fontWeight: 600 }}>
						Are you sure you want to end the survey now?
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpen(false)} autoFocus>
						No, continue survey
					</Button>
					<Button color="error" variant="contained" onClick={endNow}>
						Yes, end survey early
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

export default EndSurveyEarly;
