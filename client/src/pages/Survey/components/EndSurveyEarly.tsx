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

// The button is offered once the screening questions are done (so coupon
// eligibility can be decided) and until the closing pages are reached.
const FIRST_PAGE = 'yc_network_size';
export const END_EARLY_TARGET_PAGE = 'outro';

const isOfferedOn = (survey: Model) => {
	const pages = survey.visiblePages;
	const current = survey.currentPageNo;
	const first = pages.findIndex(p => p.name === FIRST_PAGE);
	const target = pages.findIndex(p => p.name === END_EARLY_TARGET_PAGE);
	return (
		first !== -1 && target !== -1 && current >= first && current < target
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
			<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
				<Button
					variant="outlined"
					color="error"
					onClick={() => setOpen(true)}
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
