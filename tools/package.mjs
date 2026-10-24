// Builds the game and packages only what it actually loads, ready to upload
// to the department LAMP server (File Manager → Upload → click the zip →
// UnZip into the folder, not "UnZip to folder").
//
//   npm run package                  # build + package
//   npm run package -- --skip-build  # package the existing dist/
//
// Why not just zip dist/: Vite copies everything in public/ into it, so it
// also carries Blender sources, zips and models nothing loads (~660 MB).
// This keeps index.html, the bundle, and only the asset paths the bundle
// references (plus any files a referenced .gltf points at), and fails if a
// reference is missing or its letter case differs from the file on disk —
// harmless on Windows, a 404 on the Linux server.
//
// Output (gitignored): release/site/ (serve it to test: npx serve release/site)
// and release/cgv-game-deploy.zip with index.html at the top level.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');
const SITE = path.join(RELEASE, 'site');
const ZIP = path.join(RELEASE, 'cgv-game-deploy.zip');

// Relative asset URLs as they appear in the bundle: './models/...' and
// './audio/...' strings, possibly %-encoded, ending at the closing quote. A
// trailing '/' is a directory the code builds file names in (e.g. the
// dialogue icons, or the voice clips named by hashing each line).
const ASSET_URL = /\.\/(?:models|audio)\/[^"'`)\s]+/g;

function main() {
  if (!process.argv.includes('--skip-build')) {
    console.log('Building (vite build)…');
    execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html not found — run the build first.');

  const files = new Set(['index.html']);
  const problems = [];

  // The page's own local references (the bundled script, any stylesheet).
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) addFile(decode(url), files, problems);
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"]*)"/g)) problems.push(`index.html uses an absolute path "${url}" — it breaks in a subfolder`);

  // Every asset URL the bundled code mentions.
  const bundles = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
  for (const bundle of bundles) {
    const code = fs.readFileSync(path.join(DIST, 'assets', bundle), 'utf8');
    for (const url of new Set(code.match(ASSET_URL) ?? [])) {
      const rel = decode(url);
      if (rel.endsWith('/')) addDirectory(rel, files, problems);
      else addFile(rel, files, problems);
    }
  }

  // Files a referenced .gltf loads itself (external buffers and textures).
  for (const rel of [...files].filter((f) => f.endsWith('.gltf'))) {
    const gltf = JSON.parse(fs.readFileSync(path.join(DIST, rel), 'utf8'));
    for (const { uri } of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
      if (uri && !uri.startsWith('data:')) addFile(path.posix.join(path.posix.dirname(rel), decode(uri)), files, problems);
    }
  }

  if (problems.length) fail(`Packaging stopped:\n  - ${problems.join('\n  - ')}`);

  fs.rmSync(RELEASE, { recursive: true, force: true });
  for (const rel of files) {
    const dest = path.join(SITE, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(DIST, rel), dest);
  }
  writeZip(ZIP, [...files].sort());

  const siteBytes = [...files].reduce((sum, rel) => sum + fs.statSync(path.join(DIST, rel)).size, 0);
  const left = listFiles(DIST).filter((rel) => !files.has(rel));
  const leftBytes = left.reduce((sum, rel) => sum + fs.statSync(path.join(DIST, rel)).size, 0);
  console.log(`\nPackaged ${files.size} files, ${mb(siteBytes)} (left out ${left.length} unused files, ${mb(leftBytes)}).`);
  console.log(`  ${path.relative(ROOT, ZIP)}  ${mb(fs.statSync(ZIP).size)}`);
  console.log(`  ${path.relative(ROOT, SITE)}/   test it first: npx serve ${path.relative(ROOT, SITE).replace(/\\/g, '/')}`);
}

/** './models/a%20b/c.glb' -> 'models/a b/c.glb' */
function decode(url) {
  return decodeURIComponent(url.replace(/^\.\//, ''));
}

/** Adds dist/<rel>, checking it exists with exactly this letter case. */
function addFile(rel, files, problems) {
  const issue = exactCaseIssue(rel);
  if (issue) problems.push(issue);
  else files.add(rel);
}

function addDirectory(rel, files, problems) {
  const issue = exactCaseIssue(rel.replace(/\/$/, ''));
  if (issue) return problems.push(issue);
  for (const file of listFiles(path.join(DIST, rel))) files.add(path.posix.join(rel, file));
}

/**
 * Walks the path one segment at a time comparing real directory listings,
 * since Windows/macOS file lookups ignore case and would hide a mismatch.
 */
function exactCaseIssue(rel) {
  let dir = DIST;
  for (const part of rel.split('/').filter(Boolean)) {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    if (!names.includes(part)) {
      const near = names.find((name) => name.toLowerCase() === part.toLowerCase());
      return near
        ? `"${rel}": "${part}" is "${near}" on disk — the Linux server is case-sensitive`
        : `"${rel}" is referenced by the game but missing from dist/`;
    }
    dir = path.join(dir, part);
  }
  return null;
}

function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

// --- a minimal zip writer (deflate, no dependencies) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Writes dist/<rel> for each rel into a zip, entries named by rel. */
function writeZip(zipPath, rels) {
  const out = fs.openSync(zipPath, 'w');
  const central = [];
  // Every entry stamped with the packaging time (zip's DOS format: 2-second steps).
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  const write = (buffer) => {
    fs.writeSync(out, buffer);
    offset += buffer.length;
  };

  for (const rel of rels) {
    const data = fs.readFileSync(path.join(DIST, rel));
    const packed = zlib.deflateRawSync(data, { level: 6 });
    const stored = packed.length >= data.length; // already-compressed files: store as-is
    const body = stored ? data : packed;
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);
    const entry = { name, crc, method: stored ? 0 : 8, size: data.length, packedSize: body.length, offset };

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // flags: UTF-8 names
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.packedSize, 18);
    local.writeUInt32LE(entry.size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    write(local);
    write(name);
    write(body);
    central.push(entry);
  }

  const centralStart = offset;
  for (const e of central) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);             // version made by
    header.writeUInt16LE(20, 6);             // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(e.method, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(e.crc, 16);
    header.writeUInt32LE(e.packedSize, 20);
    header.writeUInt32LE(e.size, 24);
    header.writeUInt16LE(e.name.length, 28);
    header.writeUInt16LE(0, 30);             // extra
    header.writeUInt16LE(0, 32);             // comment
    header.writeUInt16LE(0, 34);             // disk
    header.writeUInt16LE(0, 36);             // internal attrs
    header.writeUInt32LE(0, 38);             // external attrs
    header.writeUInt32LE(e.offset, 42);
    write(header);
    write(e.name);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  write(end);
  fs.closeSync(out);
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

main();
