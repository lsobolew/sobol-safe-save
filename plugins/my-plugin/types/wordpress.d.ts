/**
 * Type declarations for WordPress packages that ship none.
 *
 * @wordpress/server-side-render has neither its own types nor a DefinitelyTyped package, so
 * without this every import of it is an implicit `any` and strict mode rejects the file.
 */

declare module '@wordpress/server-side-render' {
	import type { ComponentType } from 'react';

	interface ServerSideRenderProps {
		block: string;
		// Any attribute shape: a block declares its own interface, which would not be
		// assignable to Record<string, unknown> without an index signature.
		attributes?: object;
		urlQueryArgs?: object;
		httpMethod?: 'GET' | 'POST';
		EmptyResponsePlaceholder?: ComponentType< unknown >;
		ErrorResponsePlaceholder?: ComponentType< unknown >;
		LoadingResponsePlaceholder?: ComponentType< unknown >;
	}

	const ServerSideRender: ComponentType< ServerSideRenderProps >;

	export default ServerSideRender;
}
