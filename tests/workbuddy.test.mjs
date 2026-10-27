import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('../scripts/prepare-workbuddy.mjs', import.meta.url));
test('WorkBuddy CLI isolates its public client and auth cache while preserving shared Skill bytes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'epp-workbuddy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input.json');
  const output = join(root, 'trial with spaces');
  writeFileSync(input, JSON.stringify({ serviceUrl: 'http://localhost:3000' }));
  const run = () => spawnSync(process.execPath, [cli, input, output], { encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const registration = JSON.parse(readFileSync(join(output, 'epp-client.json'), 'utf8'));
  assert.equal(registration.clientId, 'epp-workbuddy-local');
  assert.equal(registration.name, 'EPP WorkBuddy 个人试用');
  assert.deepEqual(registration.redirectUris, ['http://localhost:8771/oauth/callback']);
  const config = JSON.parse(readFileSync(join(output, 'workbuddy-mcp.json'), 'utf8')).mcpServers.epp;
  assert.equal(config.type, 'stdio');
  assert.equal(config.args[1], 'mcp-remote@0.15.2');
  assert.equal(config.env.MCP_REMOTE_CONFIG_DIR, join(output, 'auth'));
  assert.ok(config.args.includes(`@${join(output, 'oauth-client-info.json')}`));
  for (const name of ['record-expressions', 'practice-expressions']) {
    assert.deepEqual(execFileSync('unzip', ['-p', join(output, `${name}.zip`), 'SKILL.md']),
      readFileSync(new URL(`../plugins/epp/skills/${name}/SKILL.md`, import.meta.url)));
  }
  writeFileSync(join(output, 'keep.txt'), 'preserved');
  assert.equal(run().status, 1);
  assert.equal(readFileSync(join(output, 'keep.txt'), 'utf8'), 'preserved');
  assert.equal(existsSync(join(output, 'doubao-mcp.json')), false);
});

test('WorkBuddy CLI rejects unsafe connection input without creating output', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'epp-workbuddy-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input.json');
  const output = join(root, 'trial');
  for (const value of [{ serviceUrl: 'http://public.example.test' }, { serviceUrl: 'http://localhost:3000', clientId: '${SECRET}' }]) {
    writeFileSync(input, JSON.stringify(value));
    const result = spawnSync(process.execPath, [cli, input, output], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /WorkBuddy 试用准备失败/);
    assert.equal(existsSync(output), false);
  }
});
