import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildDoubaoConfig, prepareDoubao } from '../scripts/prepare-doubao.mjs';

test('uses an independent public client, fixed callback, matching resource and a pinned OAuth proxy', () => {
  const { connector, registration } = buildDoubaoConfig({ serviceUrl: 'http://localhost:3000' });
  const args = connector.args;
  const value = (key) => args[args.indexOf(key) + 1];
  assert.equal(connector.type, 'stdio');
  assert.equal(connector.command, 'npx');
  assert.deepEqual(args.slice(0, 4), ['-y', 'mcp-remote@0.15.2', 'http://localhost:3000/api/mcp', '8769']);
  assert.equal(value('--resource'), args[2]);
  assert.equal(value('--transport'), 'http-only');
  assert.deepEqual(JSON.parse(value('--static-oauth-client-info')), { client_id: 'epp-doubao-local' });
  const metadata = JSON.parse(value('--static-oauth-client-metadata'));
  assert.equal(metadata.token_endpoint_auth_method, 'none');
  assert.equal(metadata.scope.split(' ').length, 5);
  assert.deepEqual(registration.redirectUris, ['http://localhost:8769/oauth/callback']);
  assert.equal(registration.candidateConfirmation, 'epp_page');
  assert.equal(args.includes('--debug'), false);
  const online = buildDoubaoConfig({ serviceUrl: 'https://epp.example.test/api/mcp', clientId: 'trial', callbackPort: 8771 });
  assert.equal(online.registration.clientId, 'trial');
  assert.deepEqual(online.registration.redirectUris, ['http://localhost:8771/oauth/callback']);
  assert.equal(online.connector.args.at(-1), 'https://epp.example.test/api/mcp');
  assert.equal(online.connector.args.includes('--allow-http'), false);
  const ipv6 = buildDoubaoConfig({ serviceUrl: 'http://[::1]:3000' });
  assert.equal(ipv6.connector.args[2], 'http://[::1]:3000/api/mcp');
  assert.equal(ipv6.connector.args.includes('--allow-http'), true);
});

test('rejects unsafe URLs, credentials and invalid ports before creating outputs', () => {
  for (const input of [
    { serviceUrl: 'http://public.example.test' },
    { serviceUrl: 'https://epp.example.test/?token=secret' },
    { serviceUrl: 'https://user:secret@epp.example.test' },
    { serviceUrl: 'http://localhost:3000', token: 'secret' },
    { serviceUrl: 'http://localhost:3000', callbackPort: 0 },
    { serviceUrl: 'http://localhost:3000', clientId: '${OPENAI_API_KEY}' },
    null,
  ]) assert.throws(() => buildDoubaoConfig(input));
});

test('copies only the two shared Skills, isolates proxy credentials and preserves existing output', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'epp-doubao-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const outputRoot = join(root, 'output');
  const result = prepareDoubao({ input: { serviceUrl: 'http://localhost:3000' }, outputRoot });
  const config = JSON.parse(readFileSync(join(outputRoot, 'doubao-mcp.json'), 'utf8'));
  assert.equal(config.mcpServers.epp.env.MCP_REMOTE_CONFIG_DIR, join(outputRoot, 'auth'));
  for (const file of ['oauth-client-info.json', 'oauth-client-metadata.json']) {
    assert.ok(config.mcpServers.epp.args.includes(`@${join(outputRoot, file)}`));
    assert.doesNotThrow(() => JSON.parse(readFileSync(join(outputRoot, file), 'utf8')));
  }
  assert.equal(existsSync(join(outputRoot, 'auth')), false);
  for (const archive of result.skills) {
    assert.equal(execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim(), 'SKILL.md');
    const name = archive.endsWith('record-expressions.zip') ? 'record-expressions' : 'practice-expressions';
    assert.deepEqual(execFileSync('unzip', ['-p', archive, 'SKILL.md']), readFileSync(new URL(`../plugins/epp/skills/${name}/SKILL.md`, import.meta.url)));
  }
  assert.equal(existsSync(join(outputRoot, 'schedule-practice')), false);
  writeFileSync(join(outputRoot, 'keep.txt'), 'existing personal state');
  assert.throws(() => prepareDoubao({ input: { serviceUrl: 'http://localhost:3000' }, outputRoot }), /已存在/);
  assert.equal(readFileSync(join(outputRoot, 'keep.txt'), 'utf8'), 'existing personal state');
});

test('refuses symlinked Skill inputs before creating output', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'epp-doubao-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source');
  cpSync(new URL('../plugins', import.meta.url), join(sourceRoot, 'plugins'), { recursive: true });
  const file = join(sourceRoot, 'plugins/epp/skills/record-expressions/SKILL.md');
  rmSync(file);
  symlinkSync(new URL('../plugins/epp/skills/record-expressions/SKILL.md', import.meta.url), file);
  assert.throws(() => prepareDoubao({ input: { serviceUrl: 'http://localhost:3000' }, sourceRoot, outputRoot: join(root, 'output') }), /符号链接/);
  assert.equal(existsSync(join(root, 'output')), false);
});

test('CLI can generate runtime files outside a protected source directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'epp-doubao-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'input.json');
  const output = join(root, 'runtime with spaces');
  writeFileSync(config, JSON.stringify({ serviceUrl: 'http://localhost:3000' }));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../scripts/prepare-doubao.mjs', import.meta.url)), config, output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const connector = JSON.parse(readFileSync(join(output, 'doubao-mcp.json'), 'utf8')).mcpServers.epp;
  assert.equal(connector.env.MCP_REMOTE_CONFIG_DIR, join(output, 'auth'));
  assert.ok(connector.args.includes(`@${join(output, 'oauth-client-info.json')}`));
  assert.ok(existsSync(join(output, 'record-expressions.zip')));
});
