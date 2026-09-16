/**
 * Which deployment the browser is talking to.
 *
 * Production hostnames are listed explicitly and everything else - the test site,
 * a local dev server, any future preview - counts as test. The dangerous mistake is
 * a test site that looks like production, so an unknown host errs towards "test".
 */
const PRODUCTION_HOSTNAMES = ['gchd-rds.azurewebsites.net'];

export const isTestEnvironment = (): boolean =>
	!PRODUCTION_HOSTNAMES.includes(window.location.hostname.toLowerCase());
