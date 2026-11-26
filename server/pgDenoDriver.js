/**
 * The `pg` that an Edge bundle uses.
 *
 * Deno works out which npm packages a deployment needs while it is *building* the
 * deployment, not while the code runs. A lazy `await import("npm:pg@^8.23.1")`
 * therefore fails inside a deployed function with
 *
 *   Could not find constraint 'pg@^8.23.1' in the list of packages.
 *
 * even though the specifier is valid, because nothing registered the package. So
 * the Edge build aliases the module specifier `pg` to this file, and this file
 * imports it statically: the bundler sees it, downloads it, and the driver ships
 * inside the deployment.
 *
 * Node never loads this file. `server/postgresAdapter.js` asks for plain `pg`,
 * which on Node resolves to node_modules as it always has.
 */
export { default } from "npm:pg@8.23.1";
