import { SelectProps } from '@mui/material';

import { FormSelect } from './FormSelect';

interface RoleSelectProps extends Omit<SelectProps, 'variant'> {
	canEdit?: boolean;
	showTooltip?: boolean;
	includeEmptyOption?: boolean;
}

// Display names only; the stored role values stay VOLUNTEER / MANAGER / ADMIN.
export const ROLE_LABELS: Record<string, string> = {
	VOLUNTEER: 'Hub Site Surveyor',
	MANAGER: 'Hub Site Lead',
	ADMIN: 'Admin'
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
	value,
	label
}));

export const RoleSelect = ({
	canEdit = true,
	showTooltip = false,
	includeEmptyOption = true,
	...props
}: RoleSelectProps) => {
	const options = includeEmptyOption
		? [{ value: '', label: 'Select a role' }, ...ROLE_OPTIONS]
		: ROLE_OPTIONS;

	return (
		<FormSelect
			{...props}
			label="Role"
			options={options}
			canEdit={canEdit}
			showTooltip={showTooltip}
		/>
	);
};
