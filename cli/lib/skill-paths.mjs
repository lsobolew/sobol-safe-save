import fs from 'node:fs';
import path from 'node:path';

/** Include resources required by selected skills, also for older explicit install lists. */
export function resolveSkillDependencies( checkout, requested ) {
	const wanted = new Set();
	const visit = ( name ) => {
		if ( wanted.has( name ) ) return;
		if ( ! /^[a-z][a-z0-9-]*$/.test( name ) ) throw new Error( `Invalid skill name: ${ name }` );
		const directory = path.join( checkout, 'skills', name );
		if ( ! fs.existsSync( path.join( directory, 'SKILL.md' ) ) ) throw new Error( `Missing skill dependency: ${ name }` );
		wanted.add( name );
		const scan = ( dir ) => {
			for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
				const file = path.join( dir, entry.name );
				if ( entry.isDirectory() ) scan( file );
				else if ( entry.name.endsWith( '.md' ) ) {
					for ( const match of fs.readFileSync( file, 'utf8' ).matchAll( /skills\/([a-z0-9-]+)\/(?:scripts|references|assets)\//g ) ) visit( match[ 1 ] );
				}
			}
		};
		scan( directory );
	};
	requested.forEach( visit );
	return [ ...wanted ];
}

/** Adapt upstream repo-relative resource paths for the installed project layout. */
export function adaptSkillText( text, prefix = '.agents/skills' ) {
	return text.replace( /(?<![\w./-])skills\/([a-z0-9-]+\/(?:scripts|references|assets)\/[^\s`\)\]]+)/g,
		( _, resource ) => `${ prefix }/${ resource }` );
}

export function adaptSkillDirectory( directory, prefix ) {
	for ( const entry of fs.readdirSync( directory, { withFileTypes: true } ) ) {
		const file = path.join( directory, entry.name );
		if ( entry.isDirectory() ) adaptSkillDirectory( file, prefix );
		else if ( entry.name.endsWith( '.md' ) ) {
			const original = fs.readFileSync( file, 'utf8' );
			const adapted = adaptSkillText( original, prefix );
			if ( original !== adapted ) fs.writeFileSync( file, adapted );
		}
	}
}

export function validateSkillResources( directory, root ) {
	for ( const entry of fs.readdirSync( directory, { withFileTypes: true } ) ) {
		const file = path.join( directory, entry.name );
		if ( entry.isDirectory() ) validateSkillResources( file, root );
		else if ( entry.name.endsWith( '.md' ) ) {
			const text = fs.readFileSync( file, 'utf8' );
			for ( const match of text.matchAll( /\.(?:agents|claude|github|cursor)\/skills\/[a-z0-9-]+\/(?:scripts|references|assets)\/[^\s`\)\]]+/g ) ) {
				if ( ! fs.existsSync( path.join( root, match[ 0 ] ) ) ) throw new Error( `${ file }: missing resource ${ match[ 0 ] }` );
			}
		}
	}
}
