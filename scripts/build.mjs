/**
 * Builds the plugins that changed, and writes the catalog beside them.
 *
 * A plugin is its own project with its own `build`, which puts `dist/plugin.js`
 * in its folder. This script calls that build, moves the bundle into the shared
 * `dist/<id>/`, and writes `index.json` next to them — what the editor reads.
 * Nothing but `dist/` is touched here: the `build` branch is the action's
 * business, not this script's.
 *
 * Two things it does beyond that, both about what the editor can actually use:
 *
 * - A plugin whose sources have not changed since the published build is not
 *   built again — its bundle is copied from there. `PUBLISHED` points at a
 *   checkout of the `build` branch; without it everything is built.
 * - A plugin the editor would refuse — a bundle that does not run, a foreign
 *   `api` major — fails the build. Offering what cannot be installed is worse
 *   than offering nothing, and the author finds out in their own pull request
 *   rather than from a plugin quietly missing from the catalog.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist');

function fail(message) {
  console.error(`build failed: ${message}`);
  process.exit(1);
}

/** The contract major, from the contract itself: two numbers must not drift. */
const contract = await readFile(path.join(root, 'types', 'toonop.ts'), 'utf8');
const PLUGIN_API = Number(contract.match(/export type PluginApi = (\d+);/)?.[1]);
if (!PLUGIN_API) {
  fail('types/toonop.ts does not say what the contract major is');
}

/** The published catalog, when the action handed us a checkout of it. */
const published = process.env.PUBLISHED ? path.resolve(root, process.env.PUBLISHED) : null;
const before = published
  ? await readFile(path.join(published, 'index.json'), 'utf8').then(JSON.parse, () => null)
  : null;

/**
 * What a plugin is made of, as one hash: every file of its folder but its own
 * build output. Names go in with the bytes, so a rename counts as a change.
 */
async function fingerprint(base) {
  const hash = createHash('sha256');
  const walk = async (dir, prefix) => {
    const entries = (await readdir(dir, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, `${prefix}${entry.name}/`);
      } else {
        hash.update(`${prefix}${entry.name}\0`);
        hash.update(await readFile(full));
      }
    }
  };
  await walk(base, '');
  return hash.digest('hex');
}

/** The manifest the editor would read, or the reason it could not be read. */
async function manifestOf(bundle) {
  try {
    const module = await import(pathToFileURL(bundle).href);
    const manifest = module.default;
    if (typeof manifest !== 'object' || manifest === null) {
      return { reason: 'the bundle has no manifest on its default export' };
    }
    return { manifest };
  } catch (error) {
    return { reason: `the bundle does not run: ${error instanceof Error ? error.message : error}` };
  }
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

  const source = await fingerprint(base);
  const was = before?.plugins?.find((entry) => entry.id === dir);
  const asPublished = published && was?.source === source
    ? path.join(published, dir, 'plugin.js')
    : null;
  const reused = asPublished !== null && await stat(asPublished).then(() => true, () => false);

  await mkdir(path.join(out, dir), { recursive: true });
  if (reused) {
    console.log(`reusing ${dir}@${pkg.version}`);
    await cp(asPublished, path.join(out, dir, 'plugin.js'));
  } else {
    console.log(`building ${dir}@${pkg.version}`);
    execFileSync('npm', ['run', 'build'], { cwd: base, stdio: 'inherit' });
    const built = path.join(base, 'dist', 'plugin.js');
    await stat(built).catch(() => fail(`${dir}: the build left no dist/plugin.js`));
    await cp(built, path.join(out, dir, 'plugin.js'));
  }

  const bundle = path.join(out, dir, 'plugin.js');
  const { manifest, reason } = await manifestOf(bundle);
  const refuse = reason
    ?? (manifest.id !== dir ? `the bundle is plugin ${manifest.id ?? '<no id>'}, not ${dir}` : null)
    ?? (manifest.api !== PLUGIN_API ? `asks for api major ${manifest.api}, the contract is on ${PLUGIN_API}` : null);
  if (refuse) {
    fail(`${dir}: ${refuse}`);
  }

  // The record is drawn with the icon the manifest already carries: the editor
  // reads it from there for a bundle put in from a file, and a second copy in
  // the folder is a second copy to keep in step.
  const icon = manifest.icon ?? Object.values(manifest.tools ?? {})[0]?.icon;
  if (typeof icon !== 'string' || !icon.trim()) {
    fail(`${dir}: neither the manifest nor its first tool brings an icon`);
  }

  plugins.push({
    id: dir,
    name: pkg.toonop?.title ?? dir,
    version: pkg.version,
    description: pkg.description,
    icon,
    entry: `${dir}/plugin.js`,
    size: (await stat(bundle)).size,
    source,
  });
}

await writeFile(path.join(out, 'index.json'), `${JSON.stringify({ api: PLUGIN_API, plugins }, null, 2)}\n`);
console.log(`catalog: ${plugins.length} plugin(s) in dist/index.json`);
