// Custom permissions stored on a user (user.permissions) are added on top of the
// role's rules. Replaces the old utils/__tests__/customAccess.test.ts, which
// targeted the pre-refactor roleBasedAccess API.
import { subject } from '@casl/ability';
import { describe, expect, test } from '@jest/globals';

import defineAbilitiesForUser from '../abilityBuilder';
import { ACTIONS, CONDITIONS, ROLES, SUBJECTS } from '../constants';

const TEST_TIMEZONE = 'America/Los_Angeles';

const self = '6901027707fdae19aae38d4c';
const other = '6901027707fdae19aae38d4d';
const location1 = '6901027707fdae19aae38d4e';
const location2 = '6901027707fdae19aae38d4f';

function volunteerWith(
	permissions: Parameters<typeof defineAbilitiesForUser>[3]
) {
	return defineAbilitiesForUser(
		ROLES.VOLUNTEER,
		self,
		location1,
		permissions,
		TEST_TIMEZONE
	);
}

describe('Custom permissions', () => {
	test('no custom permissions leaves a volunteer with role rules only', () => {
		const ability = volunteerWith([]);

		expect(
			ability.can(ACTIONS.CASL.READ, subject(SUBJECTS.USER, { _id: self }))
		).toBe(true);
		expect(
			ability.cannot(
				ACTIONS.CASL.READ,
				subject(SUBJECTS.USER, { _id: other })
			)
		).toBe(true);
	});

	test('a permission without conditions applies everywhere', () => {
		const ability = volunteerWith([
			{ action: ACTIONS.CASL.READ, subject: SUBJECTS.USER, conditions: [] }
		]);

		expect(
			ability.can(ACTIONS.CASL.READ, subject(SUBJECTS.USER, { _id: other }))
		).toBe(true);
	});

	test('a condition limits the permission', () => {
		const ability = volunteerWith([
			{
				action: ACTIONS.CASL.READ,
				subject: SUBJECTS.SEED,
				conditions: [CONDITIONS.HAS_SAME_LOCATION]
			}
		]);

		expect(
			ability.can(
				ACTIONS.CASL.READ,
				subject(SUBJECTS.SEED, { locationObjectId: location1 })
			)
		).toBe(true);
		// Volunteers can already read all seeds by role, so check an action they lack
		const updateAbility = volunteerWith([
			{
				action: ACTIONS.CASL.UPDATE,
				subject: SUBJECTS.SEED,
				conditions: [CONDITIONS.HAS_SAME_LOCATION]
			}
		]);
		expect(
			updateAbility.can(
				ACTIONS.CASL.UPDATE,
				subject(SUBJECTS.SEED, { locationObjectId: location1 })
			)
		).toBe(true);
		expect(
			updateAbility.cannot(
				ACTIONS.CASL.UPDATE,
				subject(SUBJECTS.SEED, { locationObjectId: location2 })
			)
		).toBe(true);
	});

	test('multiple conditions must all hold', () => {
		const ability = volunteerWith([
			{
				action: ACTIONS.CASL.UPDATE,
				subject: SUBJECTS.SEED,
				conditions: [
					CONDITIONS.HAS_SAME_LOCATION,
					CONDITIONS.IS_CREATED_BY_SELF
				]
			}
		]);

		expect(
			ability.can(
				ACTIONS.CASL.UPDATE,
				subject(SUBJECTS.SEED, {
					locationObjectId: location1,
					createdByUserObjectId: self
				})
			)
		).toBe(true);
		expect(
			ability.cannot(
				ACTIONS.CASL.UPDATE,
				subject(SUBJECTS.SEED, {
					locationObjectId: location1,
					createdByUserObjectId: other
				})
			)
		).toBe(true);
	});

	test('custom permissions combine with role rules', () => {
		const ability = volunteerWith([
			{ action: ACTIONS.CASL.READ, subject: SUBJECTS.USER, conditions: [] }
		]);

		// From the custom permission
		expect(
			ability.can(ACTIONS.CASL.READ, subject(SUBJECTS.USER, { _id: other }))
		).toBe(true);
		// Role rules still apply: a volunteer can't edit another user
		expect(
			ability.cannot(
				ACTIONS.CASL.UPDATE,
				subject(SUBJECTS.USER, { _id: other })
			)
		).toBe(true);
	});

	test('an unknown condition is rejected rather than ignored', () => {
		expect(() =>
			volunteerWith([
				{
					action: ACTIONS.CASL.READ,
					subject: SUBJECTS.USER,
					conditions: ['NOT_A_CONDITION' as any]
				}
			])
		).toThrow(/unknown condition/);
	});
});
