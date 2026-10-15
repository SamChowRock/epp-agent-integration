import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { applyUserConfig, buildMcpConfig } from '../scripts/apply-user-config.mjs';

test('normalizes local and HTTPS service URLs and matches actual Codex callback identities', () => {
  const local = buildMcpConfig({ serviceUrl: 'http://localhost:3000' }).mcpServers.epp;
  assert.equal(local.url, 'http://localhost:3000/api/mcp');
  assert.equal(local.oauth.callbackUrl, 'http://127.0.0.1:8767/callback/fwqfvb1UgHvX');
  assert.equal(
    buildMcpConfig({ serviceUrl: 'http://localhost:3338/api/mcp' }).mcpServers.epp.oauth
      .callbackUrl,
    'http://127.0.0.1:8767/callback/SeoVK4BahlCL',
  );
  const online = buildMcpConfig({
    serviceUrl: 'https://epp.example.test/',
    clientId: 'epp-codex',
    callbackPort: 8770,
  }).mcpServers.epp;
  assert.equal(online.url, 'https://epp.example.test/api/mcp');
  assert.equal(online.oauth.clientId, 'epp-codex');
  assert.equal(online.oauth.callbackPort, 8770);
  assert.match(online.oauth.callbackUrl, /^http:\/\/127.0.0.1:8770\/callback\/[A-Za-z0-9_-]{12}$/);
});

test('rejects unsafe or unsupported configuration before touching installation', () => {
  for (const serviceUrl of [
    'file:///tmp/epp',
    'javascript:alert(1)',
    'http://public.example',
    'https://u:p@epp.example',
    'https://epp.example/?token=secret',
    'https://epp.example/#fragment',
    'https://epp.example/prefix',
    'https://epp.example/api/mcp/extra',
  ])
    assert.throws(() => buildMcpConfig({ serviceUrl }));
  for (const input of [
    null,
    [],
    { serviceUrl: 'https://epp.example', token: 'secret' },
    { serviceUrl: 'https://epp.example', callbackPort: 0 },
    { serviceUrl: 'https://epp.example', clientId: '' },
  ])
    assert.throws(() => buildMcpConfig(input));
});

test('applies a user URL through a generated plugin marketplace and retains it across upgrades', () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  const calls = [];
  try {
    writeFileSync(
      join(root, 'user-config.json'),
      JSON.stringify({ serviceUrl: 'https://epp.example.test' }),
    );
    const result = applyUserConfig({
      settingsRoot: root,
      runCodex: (args) => {
        calls.push(args);
        return JSON.stringify({ marketplaces: [] });
      },
    });
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'user-config.json'))), {
      serviceUrl: 'https://epp.example.test',
    });
    const pkg = join(root, 'marketplace/plugins/epp');
    assert.equal(
      JSON.parse(readFileSync(join(pkg, '.mcp.json'))).mcpServers.epp.url,
      'https://epp.example.test/api/mcp',
    );
    assert.equal(
      JSON.parse(readFileSync(join(root, 'marketplace/.agents/plugins/marketplace.json')))
        .plugins[0].source.path,
      './plugins/epp',
    );
    assert.equal(result.pluginId, 'epp@epp-local');
    const manifest = JSON.parse(readFileSync(join(pkg, '.codex-plugin/plugin.json')));
    assert.equal(manifest.version, '0.1.2');
    assert.equal(manifest.skills, './skills/');
    assert.equal(existsSync(join(pkg, 'skills/record-expressions/SKILL.md')), true);
    assert.equal(existsSync(join(pkg, 'skills/practice-expressions/SKILL.md')), true);
    assert.deepEqual(calls, [
      ['plugin', 'marketplace', 'list', '--json'],
      ['plugin', 'marketplace', 'add', join(root, 'marketplace'), '--json'],
      ['plugin', 'add', 'epp@epp-local', '--json'],
    ]);
    applyUserConfig({ settingsRoot: root, runCodex: () => JSON.stringify({ marketplaces: [] }) });
    assert.equal(
      JSON.parse(readFileSync(join(root, 'user-config.json'))).serviceUrl,
      'https://epp.example.test',
    );
    assert.equal(
      JSON.parse(readFileSync(join(pkg, '.mcp.json'))).mcpServers.epp.url,
      'https://epp.example.test/api/mcp',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('creates the default user file once and does not install invalid edited settings', () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  try {
    applyUserConfig({ settingsRoot: root, runCodex: () => JSON.stringify({ marketplaces: [] }) });
    assert.equal(
      JSON.parse(readFileSync(join(root, 'user-config.json'))).serviceUrl,
      'http://localhost:3000',
    );
    const before = readFileSync(join(root, 'marketplace/plugins/epp/.mcp.json'), 'utf8');
    writeFileSync(join(root, 'user-config.json'), '{"serviceUrl":"http://public.example"}');
    assert.throws(() =>
      applyUserConfig({ settingsRoot: root, runCodex: () => assert.fail('must not install') }),
    );
    assert.equal(readFileSync(join(root, 'marketplace/plugins/epp/.mcp.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replaces only the EPP local source and restores it when installation fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  const oldRoot = join(root, 'old');
  const catalogFile = join(oldRoot, '.agents/plugins/marketplace.json');
  const calls = [];
  try {
    mkdirSync(join(oldRoot, '.agents/plugins'), { recursive: true });
    writeFileSync(catalogFile, JSON.stringify({ plugins: [{ name: 'epp' }] }));
    const inventory = JSON.stringify({
      marketplaces: [
        { name: 'epp-local', root: oldRoot, marketplaceSource: { sourceType: 'local' } },
      ],
    });
    let installs = 0;
    assert.throws(
      () =>
        applyUserConfig({
          settingsRoot: root,
          runCodex: (args) => {
            calls.push(args);
            if (args[1] === 'marketplace' && args[2] === 'list') return inventory;
            if (args[1] === 'add' && ++installs === 1) throw Error('synthetic install failure');
            return '{}';
          },
        }),
      /synthetic install failure/,
    );
    assert.deepEqual(calls.slice(-3), [
      ['plugin', 'marketplace', 'remove', 'epp-local', '--json'],
      ['plugin', 'marketplace', 'add', oldRoot, '--json'],
      ['plugin', 'add', 'epp@epp-local', '--json'],
    ]);
    writeFileSync(catalogFile, JSON.stringify({ plugins: [{ name: 'epp' }, { name: 'other' }] }));
    const protectedCalls = [];
    assert.throws(
      () =>
        applyUserConfig({
          settingsRoot: root,
          runCodex: (args) => {
            protectedCalls.push(args);
            return inventory;
          },
        }),
      /其他插件/,
    );
    assert.deepEqual(protectedCalls, [['plugin', 'marketplace', 'list', '--json']]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restores same-source files after failed URL changes and protects extra catalog entries before writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  const marketplace = join(root, 'marketplace');
  const configFile = join(root, 'user-config.json');
  const catalogFile = join(marketplace, '.agents/plugins/marketplace.json');
  const mcpFile = join(marketplace, 'plugins/epp/.mcp.json');
  try {
    writeFileSync(configFile, JSON.stringify({ serviceUrl: 'https://old.example' }));
    applyUserConfig({ settingsRoot: root, runCodex: () => JSON.stringify({ marketplaces: [] }) });
    const before = readFileSync(mcpFile, 'utf8');
    writeFileSync(configFile, JSON.stringify({ serviceUrl: 'https://new.example' }));
    const inventory = JSON.stringify({
      marketplaces: [
        { name: 'epp-local', root: marketplace, marketplaceSource: { sourceType: 'local' } },
      ],
    });
    let installs = 0;
    assert.throws(
      () =>
        applyUserConfig({
          settingsRoot: root,
          runCodex: (args) => {
            if (args[2] === 'list') return inventory;
            if (args[1] === 'add' && ++installs === 1) throw Error('synthetic same-source failure');
            return '{}';
          },
        }),
      /synthetic same-source failure/,
    );
    assert.equal(readFileSync(mcpFile, 'utf8'), before);
    assert.equal(JSON.parse(readFileSync(configFile)).serviceUrl, 'https://new.example');
    const extra = JSON.stringify({ plugins: [{ name: 'epp' }, { name: 'other' }] });
    writeFileSync(catalogFile, extra);
    assert.throws(
      () =>
        applyUserConfig({
          settingsRoot: root,
          runCodex: (args) => {
            assert.equal(args[2], 'list');
            return inventory;
          },
        }),
      /其他插件/,
    );
    assert.equal(readFileSync(catalogFile, 'utf8'), extra);
    assert.equal(readFileSync(mcpFile, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('removes the newly registered source on first-install failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  const calls = [];
  try {
    assert.throws(
      () =>
        applyUserConfig({
          settingsRoot: root,
          runCodex: (args) => {
            calls.push(args);
            if (args[2] === 'list') return JSON.stringify({ marketplaces: [] });
            if (args[1] === 'add') throw Error('synthetic initial install failure');
            return '{}';
          },
        }),
      /synthetic initial install failure/,
    );
    assert.deepEqual(calls.at(-1), ['plugin', 'marketplace', 'remove', 'epp-local', '--json']);
    assert.equal(existsSync(join(root, 'marketplace')), false);
    assert.equal(existsSync(join(root, 'user-config.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('can apply settings from the installed script through a directory alias', async () => {
  const root = mkdtempSync(join(tmpdir(), 'epp-user-config-'));
  const real = join(root, 'real');
  const alias = join(root, 'alias');
  try {
    applyUserConfig({ settingsRoot: real, runCodex: () => JSON.stringify({ marketplaces: [] }) });
    symlinkSync(real, alias, 'dir');
    writeFileSync(
      join(real, 'user-config.json'),
      JSON.stringify({ serviceUrl: 'https://changed.example' }),
    );
    const installed = await import(
      pathToFileURL(join(real, 'marketplace/plugins/epp/scripts/apply-user-config.mjs'))
    );
    installed.applyUserConfig({
      settingsRoot: alias,
      runCodex: () => JSON.stringify({ marketplaces: [] }),
    });
    assert.equal(
      JSON.parse(readFileSync(join(real, 'marketplace/plugins/epp/.mcp.json'))).mcpServers.epp.url,
      'https://changed.example/api/mcp',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
