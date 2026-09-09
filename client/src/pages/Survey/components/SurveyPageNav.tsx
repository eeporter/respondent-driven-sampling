import { useCallback, useEffect, useRef, useState } from 'react';

import { Model } from 'survey-core';

import './SurveyPageNav.css';

/**
 * Custom page navigation for the survey.
 *
 * SurveyJS's own progress bar is disabled (`showProgressBar: false`) because its
 * "buttons" mode squeezes every page into an equal share of the width (flex-basis: 0)
 * and re-scrolls the active item on each render — with 20 pages that is unreadable on
 * an iPad, and overriding it with CSS made the page judder.
 *
 * This renders a horizontal strip of page chips that scrolls only via the arrow
 * buttons at each end. There is no visible scrollbar and no drag gesture, so nothing
 * competes with the survey's own touch handling.
 *
 * Navigation is visited-based: a page can be opened once it has been reached, so a
 * volunteer can go back to correct an answer but cannot skip ahead past validation.
 */
const SurveyPageNav = ({ survey }: { survey: Model }) => {
	const stripRef = useRef<HTMLDivElement | null>(null);
	const [pageNo, setPageNo] = useState(survey.currentPageNo);
	// A resumed survey must remember where the volunteer has already been, or the
	// nav would lock them out of pages they filled in during an earlier session.
	// Derive it from the answers themselves: any page holding a response has been
	// visited, as has everything up to the page we are resuming on.
	const [visited, setVisited] = useState<Set<number>>(() => {
		const seen = new Set<number>();
		const data = survey.data ?? {};
		survey.visiblePages.forEach((page, i) => {
			if (i <= survey.currentPageNo) seen.add(i);
			const answered = page
				.getQuestions(true)
				.some(q => data[q.name] !== undefined && data[q.name] !== null && data[q.name] !== '');
			if (answered) seen.add(i);
		});
		return seen;
	});
	const [canLeft, setCanLeft] = useState(false);
	const [canRight, setCanRight] = useState(false);

	const pages = survey.visiblePages;

	const refreshArrows = useCallback(() => {
		const el = stripRef.current;
		if (!el) return;
		setCanLeft(el.scrollLeft > 2);
		setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
	}, []);

	// keep in step with the survey, however the page was changed
	useEffect(() => {
		const onChanged = () => {
			setPageNo(survey.currentPageNo);
			setVisited(prev => new Set(prev).add(survey.currentPageNo));
		};
		survey.onCurrentPageChanged.add(onChanged);
		return () => survey.onCurrentPageChanged.remove(onChanged);
	}, [survey]);

	// bring the active chip into view without moving the page itself
	useEffect(() => {
		const el = stripRef.current;
		if (!el) return;
		const active = el.querySelector<HTMLElement>('[data-active="true"]');
		if (active) {
			const target =
				active.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2;
			el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
		}
		refreshArrows();
	}, [pageNo, refreshArrows]);

	useEffect(() => {
		refreshArrows();
		window.addEventListener('resize', refreshArrows);
		return () => window.removeEventListener('resize', refreshArrows);
	}, [refreshArrows]);

	const nudge = (direction: -1 | 1) => {
		const el = stripRef.current;
		if (!el) return;
		el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.7), behavior: 'smooth' });
	};

	const go = (index: number) => {
		if (index === pageNo) return;
		// backwards, or forwards only to somewhere already reached
		if (index < pageNo || visited.has(index)) survey.currentPageNo = index;
	};

	return (
		<nav className="spn" aria-label="Survey pages">
			<button
				type="button"
				className="spn__arrow"
				onClick={() => nudge(-1)}
				disabled={!canLeft}
				aria-label="Scroll pages left"
			>
				‹
			</button>

			<div className="spn__strip" ref={stripRef} onScroll={refreshArrows}>
				{pages.map((page, i) => {
					const reachable = i <= pageNo || visited.has(i);
					return (
						<button
							key={page.name}
							type="button"
							data-active={i === pageNo}
							className={
								'spn__chip' +
								(i === pageNo ? ' spn__chip--active' : '') +
								(reachable ? '' : ' spn__chip--locked')
							}
							disabled={!reachable}
							onClick={() => go(i)}
							title={page.navigationTitle || page.title || page.name}
						>
							<span className="spn__num">{i + 1}</span>
							<span className="spn__label">
								{page.navigationTitle || page.title || page.name}
							</span>
						</button>
					);
				})}
			</div>

			<button
				type="button"
				className="spn__arrow"
				onClick={() => nudge(1)}
				disabled={!canRight}
				aria-label="Scroll pages right"
			>
				›
			</button>
		</nav>
	);
};

export default SurveyPageNav;
