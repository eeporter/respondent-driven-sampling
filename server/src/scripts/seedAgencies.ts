/**
 * Agencies that hand out seed coupons (seed-agencies.yaml). Each seed made for an
 * agency records the agency's name and location, and is tied to the agency's
 * survey site, so seeds can be traced back to who handed them out.
 */
import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

export interface SeedAgency {
	name: string;
	/** where the agency is; some agencies have none */
	location?: string;
	/** hubName of the survey site the agency's seeds belong to */
	site: string;
}

export const SEED_AGENCIES_FILE = 'seed-agencies.yaml';

/** Parse and check the agency list. @throws Error naming the first bad entry. */
export function parseSeedAgencies(text: string): SeedAgency[] {
	const parsed: unknown = parseYaml(text);
	if (!Array.isArray(parsed)) {
		throw new Error(`${SEED_AGENCIES_FILE} must be a list of agencies`);
	}
	const agencies = parsed.map((entry, i) => {
		const fields = ['name', 'site'] as const;
		for (const field of fields) {
			const value = entry?.[field];
			if (typeof value !== 'string' || !value.trim()) {
				throw new Error(
					`${SEED_AGENCIES_FILE} entry ${i + 1} needs a "${field}"`
				);
			}
		}
		if (
			entry.location !== undefined &&
			(typeof entry.location !== 'string' || !entry.location.trim())
		) {
			throw new Error(
				`${SEED_AGENCIES_FILE} entry ${i + 1} has an empty "location"`
			);
		}
		return {
			name: entry.name.trim(),
			...(entry.location && { location: entry.location.trim() }),
			site: entry.site.trim()
		};
	});
	const seen = new Set<string>();
	for (const agency of agencies) {
		const key = `${agency.name}|${agency.location ?? ''}`.toLowerCase();
		if (seen.has(key)) {
			throw new Error(
				`${SEED_AGENCIES_FILE} lists ${describeSeedAgency(agency)} twice`
			);
		}
		seen.add(key);
	}
	return agencies;
}

export function loadSeedAgencies(scriptsDir: string): SeedAgency[] {
	return parseSeedAgencies(
		fs.readFileSync(path.join(scriptsDir, SEED_AGENCIES_FILE), 'utf8')
	);
}

/**
 * Find one agency by name (any letter case). An agency listed for two sites
 * also needs its location.
 * @throws Error listing the choices when the name is unknown or ambiguous.
 */
export function findSeedAgency(
	agencies: SeedAgency[],
	name: string,
	location?: string
): SeedAgency {
	const same = (a: string, b: string) =>
		a.trim().toLowerCase() === b.trim().toLowerCase();
	const byName = agencies.filter(agency => same(agency.name, name));
	if (byName.length === 0) {
		throw new Error(
			`No agency named "${name}" in ${SEED_AGENCIES_FILE}. Agencies: ${agencies
				.map(describeSeedAgency)
				.join('; ')}`
		);
	}
	const matches = location
		? byName.filter(agency => same(agency.location ?? '', location))
		: byName;
	if (matches.length === 1) {
		return matches[0];
	}
	throw new Error(
		`"${name}" is listed in ${byName.map(agency => agency.location).join(' and ')}; ` +
			'add --agency-location to pick one'
	);
}

/** "RYSE (Richmond)", or just the name when the agency has no location */
export function describeSeedAgency(agency: SeedAgency): string {
	return agency.location
		? `${agency.name} (${agency.location})`
		: agency.name;
}

/** The line printed at the top of an agency's seed coupons: "Seed coupon for: RYSE (Richmond)". */
export function seedCouponHeader(agency: SeedAgency): string {
	return `Seed coupon for: ${describeSeedAgency(agency)}`;
}
