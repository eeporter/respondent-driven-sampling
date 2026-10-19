import { SelectProps } from '@mui/material';

import { FormSelect } from './FormSelect';

interface RoleSelectProps extends Omit<SelectProps, 'variant'> {
	canEdit?: boolean;
	showTooltip?: boolean;
	includeEmptyOption?: boolean;
	allowedRoles?: string[];
}

const ROLE_OPTIONS = [
	{ value: 'VOLUNTEER', label: 'Volunteer' },
	{ value: 'MANAGER', label: 'Manager' },
	{ value: 'ADMIN', label: 'Admin' }
];

export const RoleSelect = ({
	canEdit = true,
	showTooltip = false,
	includeEmptyOption = true,
	allowedRoles,
	...props
}: RoleSelectProps) => {
	const roleOptions = allowedRoles
		? ROLE_OPTIONS.filter(option => allowedRoles.includes(option.value))
		: ROLE_OPTIONS;
	const options = includeEmptyOption
		? [{ value: '', label: 'Select a role' }, ...roleOptions]
		: roleOptions;

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
