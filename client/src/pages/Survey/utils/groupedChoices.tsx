import { createElement, Fragment } from 'react';
import { ItemValue, Serializer } from 'survey-core';
import { ReactElementFactory } from 'survey-react-ui';

/**
 * Category headers inside a long checkbox list (e.g. the benefits question).
 * SurveyJS has no choice groups, so a choice can carry a `groupTitle` (English
 * default plus "es"), and a question whose `itemComponent` is
 * GROUPED_CHECKBOX_ITEM shows that title as a header above the choice.
 * Answers are stored exactly as before.
 */
export const GROUPED_CHECKBOX_ITEM = 'yc-grouped-checkbox-item';

if (!Serializer.findProperty('itemvalue', 'groupTitle')) {
	Serializer.addProperty('itemvalue', {
		name: 'groupTitle',
		isLocalizable: true,
		visible: false
	});
}

ReactElementFactory.Instance.registerElement(
	GROUPED_CHECKBOX_ITEM,
	(props: { item: ItemValue; key?: string }) => {
		const title = (props.item as ItemValue & { groupTitle?: string })
			.groupTitle;
		const choice = ReactElementFactory.Instance.createElement(
			'survey-checkbox-item',
			props
		);
		if (!title) return choice;
		return createElement(
			Fragment,
			null,
			createElement(
				'div',
				{
					role: 'presentation',
					style: {
						fontWeight: 700,
						margin: '16px 0 4px',
						paddingBottom: 2,
						borderBottom: '1px solid #ccc'
					}
				},
				title
			),
			choice
		);
	}
);
