/** strict-json emits an array of findings, or this exact WP-CLI success line when empty. */
export function pluginCheckPassed( { code, stdout } ) {
	if ( code !== 0 ) return false;
	if ( stdout.trim() === 'Success: Checks complete. No errors found.' ) return true;
	try {
		const findings = JSON.parse( stdout );
		return Array.isArray( findings ) && findings.every( ( finding ) =>
			finding && typeof finding === 'object' &&
			typeof finding.type === 'string' && finding.type.toLowerCase() === 'warning'
		);
	} catch {
		return false;
	}
}
