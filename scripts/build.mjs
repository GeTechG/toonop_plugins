/**
 * Builds every plugin and the catalog beside them.
 *
 * A plugin is its own project with its own `build`, which puts `dist/plugin.js`
 * in its folder. This script calls that build, moves the bundle into the shared
 * `dist/<id>/`, and writes `index.json` next to them — what the editor reads.
 * Nothing but `dist/` is touched here: the `build` branch is the action's
 * business, not this script's.
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The plugin contract major; the editor loads a catalog of its own only. */
const PLUGIN_API = 1;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist');

/** The inside of an icon: the editor draws it in its own <svg viewBox="0 0 24 24">. */
function iconMarkup(svg) {
  const inner = svg.replace(/^[^]*?<svg[^>]*>/, '').replace(/<\/svg>[^]*$/, '');
  return inner.replace(/\s+/g, ' ').trim();
}

function fail(message) {
  console.error(`build failed: ${message}`);
  process.exit(1);
}

const dirs = (await readdir(path.join(root, 'plugins'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const plugins = [];
for (const dir of dirs) {
  const base = path.join(root, 'plugins', dir);
  const pkg = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
  // The package name is the plugin id: one key for the catalog, for the
  // editor's register and for the folder the sources live in.
  if (pkg.name !== dir) {
    fail(`plugins/${dir}: package name is "${pkg.name}" but the folder is "${dir}"`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version ?? '')) {
    fail(`${dir}: version must look like 1.2.3, not "${pkg.version}"`);
  }
  if (!pkg.description) {
    fail(`${dir}: without a description there is nothing to show in the catalog`);
  }
  if (!pkg.scripts?.build) {
    fail(`${dir}: no build script`);
  }

  console.log(`building ${dir}@${pkg.version}`);
  execFileSync('npm', ['run', 'build'], { cwd: base, stdio: 'inherit' });

  const bundle = path.join(base, 'dist', 'plugin.js');
  const size = await stat(bundle).then((s) => s.size, () => fail(`${dir}: the build left no dist/plugin.js`));
  await mkdir(path.join(out, dir), { recursive: true });
  await cp(bundle, path.join(out, dir, 'plugin.js'));

  const icon = await readFile(path.join(base, pkg.toonop?.icon ?? 'icon.svg'), 'utf8')
    .then(iconMarkup, () => fail(`${dir}: no icon file`));

  plugins.push({
    id: dir,
    name: pkg.toonop?.title ?? dir,
    version: pkg.version,
    description: pkg.description,
    icon,
    entry: `${dir}/plugin.js`,
    size,
  });
}

await writeFile(path.join(out, 'index.json'), `${JSON.stringify({ api: PLUGIN_API, plugins }, null, 2)}\n`);
console.log(`catalog: ${plugins.length} plugin(s) in dist/index.json`);
