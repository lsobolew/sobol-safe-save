/**
 * Stylesheets imported for their side effect.
 *
 * `import './editor.scss'` exists to tell the bundler the file belongs to this entry point; it
 * has no exports and nothing reads a value from it. TypeScript 7 refuses a side-effect import of
 * a module it has no declaration for, where earlier versions let it pass, so the declaration
 * says what was always true: these are assets the build handles, not code.
 */
declare module '*.scss';
declare module '*.css';
