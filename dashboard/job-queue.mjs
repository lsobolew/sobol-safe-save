/** Each caller sees its own failure; later jobs still get a turn. */
export function createJobQueue() {
	let tail = Promise.resolve();
	return ( worker ) => {
		const result = tail.then( worker );
		tail = result.catch( () => {} );
		return result;
	};
}
