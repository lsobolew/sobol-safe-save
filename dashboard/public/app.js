/**
 * WP Plugin Lab dashboard - the browser side.
 * State comes from /api/state, the log is streamed over SSE from /api/stream.
 */

const el = ( id ) => document.getElementById( id );
const logBox = el( 'log' );

// The containers (PHPUnit, docker, Playwright) colour their output with ANSI sequences. Strip
// them and recreate the colour in the dashboard from the content of the line instead.
const ANSI = new RegExp( String.fromCharCode( 27 ) + '\\[[0-9;]*m', 'g' );

let state = null;
const selection = {
	suites: new Set( [ 'unit', 'integration' ] ),
	targets: new Set(),
	themes: new Set(),
	edition: 'free',
};

const SUITE_LABELS = {
	unit: 'unit',
	integration: 'integration',
	e2e: 'e2e',
	types: 'typescript',
	lint: 'phpcs',
	analyse: 'phpstan',
	'plugin-check': 'plugin check',
};

async function api( path, options ) {
	const res = await fetch( path, {
		headers: { 'Content-Type': 'application/json' },
		...options,
	} );
	return res.json().catch( () => ( {} ) );
}

function appendLog( chunk ) {
	const clean = chunk.replace( ANSI, '' );
	const node = document.createElement( 'span' );

	if ( /^={10,}/m.test( clean ) ) {
		node.className = 'head';
	} else if ( /FAILURES!|ERRORS!|\bFAIL\b/.test( clean ) ) {
		node.className = 'fail';
	} else if ( /^OK \(\d+ test/m.test( clean ) || /\d+ passed/.test( clean ) ) {
		node.className = 'ok';
	}

	node.textContent = clean;
	logBox.appendChild( node );

	if ( el( 'autoscroll' ).checked ) {
		logBox.scrollTop = logBox.scrollHeight;
	}
}

function resultBadges( targetId ) {
	const entries = Object.entries( state.results ).filter( ( [ key ] ) =>
		key.startsWith( targetId + '-' )
	);

	if ( ! entries.length ) {
		return '<span class="badge">no results yet</span>';
	}

	return entries
		.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) )
		.map( ( [ key, summary ] ) => {
			const label = key.slice( targetId.length + 1 );
			const failed = summary.failures + summary.errors;
			const count = summary.passed ? summary.tests : failed + '/' + summary.tests;
			const when = new Date( summary.updatedAt ).toLocaleString();
			const cls = summary.passed ? 'ok' : 'fail';

			return `<span class="badge ${ cls }" title="${ when }">${ label } <span class="count">${ count }</span></span>`;
		} )
		.join( '' );
}

function renderTargets() {
	el( 'targets' ).innerHTML = state.targets
		.map( ( t ) => {
			const dot = t.ready ? 'ready' : t.state === 'running' ? 'starting' : 'absent';
			const label = t.ready ? 'ready' : t.state === 'absent' ? 'stopped' : t.state;
			const toggle =
				t.state === 'running'
					? `<button class="btn" data-action="down" data-id="${ t.id }">Stop</button>`
					: `<button class="btn" data-action="up" data-id="${ t.id }">Start</button>`;

			return `
			<article class="target" data-id="${ t.id }">
				<div class="target-head">
					<span class="target-id"><span class="dot ${ dot }"></span>${ t.id }</span>
					<span class="target-meta">WP ${ t.wp }${ t.multisite ? ' &middot; MS' : '' } &middot; PHP ${ t.php }</span>
				</div>
				<div class="target-meta">${ label } &middot; <a class="link" href="${ t.url }" target="_blank" rel="noreferrer">:${ t.port }</a></div>
				<div class="badges">${ resultBadges( t.id ) }</div>
				<div class="target-actions">
					${ toggle }
					<button class="btn" data-action="reset" data-id="${ t.id }">Reset</button>
					<a class="btn" href="${ t.adminUrl }" target="_blank" rel="noreferrer">wp-admin</a>
					<button class="btn" data-action="run-here" data-id="${ t.id }">Test</button>
				</div>
			</article>`;
		} )
		.join( '' );
}

function chip( group, value, label, active ) {
	return `<label class="chip ${ active ? 'on' : '' }" data-group="${ group }" data-value="${ value }">
		<input type="checkbox" ${ active ? 'checked' : '' } /> ${ label }
	</label>`;
}

function renderControls() {
	el( 'suites' ).innerHTML = state.suites
		.map( ( s ) => chip( 'suites', s, SUITE_LABELS[ s ] || s, selection.suites.has( s ) ) )
		.join( '' );

	el( 'run-targets' ).innerHTML = state.targets
		.map( ( t ) => chip( 'targets', t.id, t.id, selection.targets.has( t.id ) ) )
		.join( '' );

	const editions = state.editions.length > 1 ? state.editions.concat( [ 'both' ] ) : state.editions;

	el( 'editions' ).innerHTML = editions
		.map( ( e ) => chip( 'edition', e, e === 'both' ? 'both' : e, selection.edition === e ) )
		.join( '' );

	const themes = state.themes || [];

	el( 'themes-field' ).hidden = themes.length === 0;
	el( 'themes' ).innerHTML = themes
		.map( ( t ) =>
			chip( 'themes', t.alias, `${ t.alias } (${ t.type })`, selection.themes.has( t.alias ) )
		)
		.join( '' );
}

function render() {
	if ( ! state ) return;

	el( 'sub' ).textContent =
		state.targets.length +
		' WordPress versions · login: ' +
		state.credentials.user +
		' / ' +
		state.credentials.password;
	el( 'mailpit' ).href = state.mailpitUrl;

	renderTargets();
	renderControls();

	const job = state.jobs[ state.jobs.length - 1 ];
	const stateEl = el( 'job-state' );

	if ( ! job ) {
		stateEl.textContent = '';
	} else if ( job.state === 'running' ) {
		stateEl.className = 'job-state running';
		stateEl.textContent = 'running: ' + job.title;
	} else {
		stateEl.className = 'job-state ' + ( job.ok ? 'ok' : 'fail' );
		stateEl.textContent = ( job.ok ? 'done' : 'failed' ) + ': ' + job.title;
	}

	el( 'run-btn' ).disabled = Boolean( state.activeJobId );
}

async function refresh() {
	state = await api( '/api/state' );
	render();
}

document.addEventListener( 'click', async ( event ) => {
	const chipEl = event.target.closest( '.chip' );

	if ( chipEl ) {
		event.preventDefault();
		const group = chipEl.dataset.group;
		const value = chipEl.dataset.value;

		if ( group === 'edition' ) {
			selection.edition = value;
		} else {
			const set = selection[ group ];
			if ( set.has( value ) ) {
				set.delete( value );
			} else {
				set.add( value );
			}
		}

		renderControls();
		return;
	}

	const btn = event.target.closest( 'button[data-action]' );
	if ( ! btn ) return;

	const action = btn.dataset.action;
	const id = btn.dataset.id;

	if ( action === 'run-here' ) {
		selection.targets = new Set( [ id ] );
		renderControls();
		el( 'run-form' ).requestSubmit();
		return;
	}

	if (
		action === 'reset' &&
		! confirm( 'Reset "' + id + '"? All data for this instance will be dropped.' )
	) {
		return;
	}

	btn.disabled = true;
	await api( '/api/targets/' + id + '/' + action, { method: 'POST' } );
	await refresh();
} );

el( 'run-form' ).addEventListener( 'submit', async ( event ) => {
	event.preventDefault();

	if ( ! selection.suites.size ) {
		appendLog( 'Pick at least one test suite.\n' );
		return;
	}

	await api( '/api/run', {
		method: 'POST',
		body: JSON.stringify( {
			suites: Array.from( selection.suites ),
			targets: Array.from( selection.targets ),
			themes: Array.from( selection.themes ),
			edition: selection.edition,
		} ),
	} );
	await refresh();
} );

el( 'down-all' ).addEventListener( 'click', async () => {
	if ( ! confirm( 'Stop every instance?' ) ) return;
	await api( '/api/down-all', { method: 'POST' } );
	await refresh();
} );

el( 'clear-log' ).addEventListener( 'click', () => {
	logBox.textContent = '';
} );

const stream = new EventSource( '/api/stream' );
stream.addEventListener( 'log', ( event ) => appendLog( JSON.parse( event.data ).chunk ) );
stream.addEventListener( 'state', ( event ) => {
	state = JSON.parse( event.data );
	render();
} );
stream.addEventListener( 'job', () => refresh() );

refresh();
