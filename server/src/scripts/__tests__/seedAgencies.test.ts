import fs from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';

import {
	findSeedAgency,
	loadSeedAgencies,
	parseSeedAgencies,
	seedCouponHeader
} from '../seedAgencies';

const scriptsDir = path.join(__dirname, '..');

describe('seed agencies', () => {
	const agencies = loadSeedAgencies(scriptsDir);

	test('every agency points at a survey site in locations.yaml', () => {
		const hubs = fs.readFileSync(
			path.join(scriptsDir, 'locations.yaml'),
			'utf8'
		);
		for (const agency of agencies) {
			expect(hubs).toContain(`hubName: '${agency.site}'`);
		}
	});

	test('finds an agency by name in any letter case', () => {
		expect(findSeedAgency(agencies, 'ryse').location).toBe('Richmond');
	});

	test('an agency at two sites needs its location', () => {
		const name = 'Los Medanos College-Basic Needs Program';
		expect(() => findSeedAgency(agencies, name)).toThrow(
			/--agency-location/
		);
		expect(findSeedAgency(agencies, name, 'brentwood').site).toBe(
			'Brentwood Library'
		);
	});

	test('an unknown agency lists the known ones', () => {
		expect(() => findSeedAgency(agencies, 'Nope')).toThrow(
			/RYSE \(Richmond\)/
		);
	});

	test('rejects entries missing a field or listed twice', () => {
		expect(() =>
			parseSeedAgencies("- name: 'A'\n  location: 'B'\n")
		).toThrow(/needs a "site"/);
		const twice =
			'- {name: A, location: B, site: C}\n- {name: a, location: b, site: D}\n';
		expect(() => parseSeedAgencies(twice)).toThrow(/twice/);
	});

	test('an agency without a location prints only its name', () => {
		const yab = findSeedAgency(agencies, 'YAB');
		expect(yab.location).toBeUndefined();
		expect(yab.site).toBe('Brentwood Library');
		expect(seedCouponHeader(yab)).toBe('Seed coupon for: YAB');
	});

	test('coupon header names the agency and its site', () => {
		expect(seedCouponHeader(findSeedAgency(agencies, 'RYSE'))).toBe(
			'Seed coupon for: RYSE (Richmond) · Survey site: San Pablo Library'
		);
	});
});
