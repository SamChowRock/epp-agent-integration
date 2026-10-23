import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'epp-export-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source');
  for (const path of ['plugins/epp', '.agents/plugins']) {
    mkdirSync(dirname(join(sourceRoot, path)), { recursive: true });
    cpSync(join(workspace, path), join(sourceRoot, path), { recursive: true });
  }
  writeFileSync(join(sourceRoot, 'plugins/epp/.env'), 'PRIVATE_SENTINEL');
  writeFileSync(join(sourceRoot, 'plugins/epp/user-config.json'), 'PRIVATE_SENTINEL');
  execFileSync('git', ['init', '-q'], { cwd: sourceRoot });
  execFileSync('git', ['add', '-f', '.'], { cwd: sourceRoot });
  return { sourceRoot, outputRoot: join(root, 'output'), root };
}

test('exports only approved files and runs the configuration suite from the extracted ZIP', async (t) => {
  const options = fixture(t);
  const { exportEppPlugin, getPublicPluginFiles } =
    await import('../scripts/export-plugin.mjs');
  const publicFiles = Object.keys(getPublicPluginFiles(options.sourceRoot)).sort();
  const result = exportEppPlugin(options);
  const entries = execFileSync('unzip', ['-Z1', result.archive], { encoding: 'utf8' })
    .trim()
    .split('\n');
  const prefix = 'epp-agent-integration-0.1.2/';
  assert.deepEqual(entries.sort(), publicFiles.map((file) => prefix + file).sort());
  const extracted = join(options.root, 'extracted');
  execFileSync('unzip', ['-q', result.archive, '-d', extracted]);
  const packageRoot = join(extracted, 'epp-agent-integration-0.1.2');
  for (const file of publicFiles) {
    const source = ['README.md', 'LICENSE', '.gitignore'].includes(file)
      ? `plugins/epp/${file}`
      : file;
    assert.deepEqual(
      readFileSync(join(packageRoot, file)),
      readFileSync(join(options.sourceRoot, source)),
    );
    assert.deepEqual(
      readFileSync(join(result.directory, file)),
      readFileSync(join(packageRoot, file)),
    );
  }
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const output = execFileSync(
    process.execPath,
    ['--test', 'plugins/epp/tests/user-config.test.mjs'],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: childEnv,
    },
  );
  assert.match(output, /fail 0/);
  const state = '.local/practice-schedule/state.json';
  const schedule = JSON.parse(
    execFileSync(
      process.execPath,
      [
        'plugins/epp/skills/schedule-practice/scripts/random-slots.mjs',
        'check',
        '--config',
        'plugins/epp/skills/schedule-practice/config.example.json',
        '--state',
        state,
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    ),
  );
  assert.ok(['quiet', 'practice'].includes(schedule.action));
  assert.equal(existsSync(join(packageRoot, state)), true);
  assert.equal(existsSync(join(result.directory, '.git')), false);
  execFileSync('git', ['init', '-q'], { cwd: packageRoot });
  assert.equal(
    execFileSync('git', ['check-ignore', '--no-index', state], {
      cwd: packageRoot,
      encoding: 'utf8',
    }).trim(),
    state,
  );
  for (const file of publicFiles.filter((file) => file.endsWith('SKILL.md'))) {
    const base = dirname(join(packageRoot, file));
    for (const [, link] of readFileSync(join(packageRoot, file), 'utf8').matchAll(
      /\]\(([^)]+)\)/g,
    )) {
      if (!link.includes('://')) assert.equal(existsSync(resolve(base, link)), true, link);
    }
  }
  assert.throws(() => exportEppPlugin(options), /已存在/);
});

test('exports newly tracked directory files without maintaining a file list', async (t) => {
  const options = fixture(t);
  const file = 'plugins/epp/skills/new-skill/references/example.md';
  mkdirSync(dirname(join(options.sourceRoot, file)), { recursive: true });
  writeFileSync(join(options.sourceRoot, file), 'new shared resource');
  execFileSync('git', ['add', file], { cwd: options.sourceRoot });
  const { exportEppPlugin } = await import('../scripts/export-plugin.mjs');
  const result = exportEppPlugin(options);
  assert.equal(readFileSync(join(result.directory, file), 'utf8'), 'new shared resource');
  assert.equal(existsSync(join(result.directory, 'plugins/epp/.env')), false);
  assert.equal(existsSync(join(result.directory, 'plugins/epp/user-config.json')), false);
});

test('rejects file and parent symlinks before copying private contents', async (t) => {
  const options = fixture(t);
  const { exportEppPlugin } = await import('../scripts/export-plugin.mjs');
  const license = join(options.sourceRoot, 'plugins/epp/LICENSE');
  rmSync(license);
  symlinkSync(join(options.sourceRoot, 'plugins/epp/.env'), license);
  assert.throws(() => exportEppPlugin(options), /普通文件|符号链接/);
  rmSync(license);
  cpSync(join(workspace, 'plugins/epp/LICENSE'), license);
  rmSync(join(options.sourceRoot, 'plugins/epp/skills'), { recursive: true });
  symlinkSync(
    join(workspace, 'plugins/epp/skills'),
    join(options.sourceRoot, 'plugins/epp/skills'),
    'dir',
  );
  assert.throws(() => exportEppPlugin(options), /普通文件|符号链接/);
  assert.equal(existsSync(options.outputRoot), false);
});

test('rejects path-like versions without creating output', async (t) => {
  const options = fixture(t);
  const { exportEppPlugin } = await import('../scripts/export-plugin.mjs');
  const manifest = join(options.sourceRoot, 'plugins/epp/.codex-plugin/plugin.json');
  const value = JSON.parse(readFileSync(manifest, 'utf8'));
  value.version = '../../outside';
  writeFileSync(manifest, JSON.stringify(value));
  assert.throws(() => exportEppPlugin(options), /版本/);
  assert.equal(existsSync(options.outputRoot), false);
});

test('preserves existing dangling archive links and never writes their targets', async (t) => {
  const options = fixture(t);
  const { exportEppPlugin } = await import('../scripts/export-plugin.mjs');
  mkdirSync(options.outputRoot);
  const outside = join(options.root, 'outside.zip');
  symlinkSync(outside, join(options.outputRoot, 'epp-agent-integration-0.1.2.zip'));
  assert.throws(() => exportEppPlugin(options), /已存在/);
  assert.equal(existsSync(outside), false);
});

test('removes only its new output if ZIP creation fails', async (t) => {
  const options = fixture(t);
  await import('../scripts/export-plugin.mjs');
  mkdirSync(options.outputRoot);
  writeFileSync(join(options.outputRoot, 'keep.txt'), 'existing evidence');
  const bin = join(options.root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'zip'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(bin, 'zip'), 0o755);
  const runner = `import { exportEppPlugin } from ${JSON.stringify(new URL('../scripts/export-plugin.mjs', import.meta.url).href)}; exportEppPlugin(${JSON.stringify(options)});`;
  assert.throws(() =>
    execFileSync(process.execPath, ['--input-type=module', '-e', runner], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdio: 'pipe',
    }),
  );
  assert.deepEqual(readdirSync(options.outputRoot), ['keep.txt']);
});
