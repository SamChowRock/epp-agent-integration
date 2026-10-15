import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSettingsRoot = join(homedir(), '.codex', 'epp');

export function buildMcpConfig(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['serviceUrl', 'clientId', 'callbackPort'].includes(key))
  )
    throw new Error('用户配置只接受 serviceUrl、可选 clientId 和 callbackPort。');
  if (
    typeof input.serviceUrl !== 'string' ||
    !input.serviceUrl.trim() ||
    input.serviceUrl.length > 2048
  )
    throw new Error('serviceUrl 必须为 EPP 服务 URL。');
  const url = new URL(input.serviceUrl.trim());
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/api/mcp', '/api/mcp/'].includes(url.pathname) ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error(
      '服务 URL 只接受本地回环 HTTP 或 HTTPS，不能含凭据、查询参数、片段或自定义路径前缀。',
    );
  const clientId = input.clientId ?? 'epp-codex-local';
  const callbackPort = input.callbackPort ?? 8767;
  if (typeof clientId !== 'string' || !clientId || clientId.length > 200 || /\s/.test(clientId))
    throw new Error('clientId 必须为目标服务预登记的客户端 ID。');
  if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535)
    throw new Error('callbackPort 必须为 1024–65535 的端口。');
  const mcpUrl = url.origin + '/api/mcp';
  // shortcut: Codex 0.162 callback IDs use the first nine SHA-256 bytes; recheck when changing hosts/versions.
  const callbackId = createHash('sha256')
    .update(mcpUrl)
    .digest()
    .subarray(0, 9)
    .toString('base64url');
  return {
    mcpServers: {
      epp: {
        type: 'http',
        url: mcpUrl,
        oauth: {
          clientId,
          callbackPort,
          callbackUrl: `http://127.0.0.1:${callbackPort}/callback/${callbackId}`,
        },
      },
    },
  };
}

export function applyUserConfig({
  settingsRoot = defaultSettingsRoot,
  runCodex = (args) => execFileSync('codex', args, { encoding: 'utf8' }),
} = {}) {
  const configFile = join(settingsRoot, 'user-config.json');
  const raw = existsSync(configFile)
    ? readFileSync(configFile, 'utf8')
    : readFileSync(join(pluginRoot, 'user-config.example.json'), 'utf8');
  const mcp = buildMcpConfig(JSON.parse(raw));
  mkdirSync(settingsRoot, { recursive: true, mode: 0o700 });
  if (!existsSync(configFile)) writeFileSync(configFile, raw, { mode: 0o600 });
  const marketplaceRoot = join(settingsRoot, 'marketplace');
  const generatedPlugin = join(marketplaceRoot, 'plugins', 'epp');
  const inventory = JSON.parse(runCodex(['plugin', 'marketplace', 'list', '--json']));
  const previous = inventory.marketplaces.find((item) => item.name === 'epp-local');
  const replacing = previous && resolve(previous.root) !== resolve(marketplaceRoot);
  if (previous && previous.marketplaceSource?.sourceType !== 'local')
    throw new Error('已有 epp-local 不是本地来源，须先人工处理来源冲突。');
  for (const root of new Set([marketplaceRoot, previous?.root].filter(Boolean))) {
    const file = join(root, '.agents/plugins/marketplace.json');
    if (existsSync(file)) {
      const catalog = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(catalog.plugins) || catalog.plugins.some((item) => item.name !== 'epp'))
        throw new Error('已有 epp-local 来源包含其他插件，须先人工处理来源冲突。');
    }
  }
  const backupFolder = mkdtempSync(join(settingsRoot, '.apply-'));
  const backup = join(backupFolder, 'marketplace');
  const existed = existsSync(marketplaceRoot);
  if (existed) cpSync(marketplaceRoot, backup, { recursive: true });
  let added = false;
  let restored = true;
  try {
    if (!existsSync(generatedPlugin) || realpathSync(generatedPlugin) !== realpathSync(pluginRoot))
      cpSync(pluginRoot, generatedPlugin, { recursive: true });
    writeFileSync(join(generatedPlugin, '.mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
    const catalogFolder = join(marketplaceRoot, '.agents', 'plugins');
    mkdirSync(catalogFolder, { recursive: true });
    writeFileSync(
      join(catalogFolder, 'marketplace.json'),
      JSON.stringify(
        {
          name: 'epp-local',
          interface: { displayName: 'EPP 本地插件' },
          plugins: [
            {
              name: 'epp',
              source: { source: 'local', path: './plugins/epp' },
              policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
              category: 'Productivity',
            },
          ],
        },
        null,
        2,
      ) + '\n',
    );
    if (replacing) runCodex(['plugin', 'marketplace', 'remove', 'epp-local', '--json']);
    runCodex(['plugin', 'marketplace', 'add', marketplaceRoot, '--json']);
    added = true;
    runCodex(['plugin', 'add', 'epp@epp-local', '--json']);
  } catch (error) {
    try {
      rmSync(marketplaceRoot, { recursive: true, force: true });
      if (existed) cpSync(backup, marketplaceRoot, { recursive: true });
      if (previous) {
        if (replacing && added)
          runCodex(['plugin', 'marketplace', 'remove', 'epp-local', '--json']);
        runCodex(['plugin', 'marketplace', 'add', previous.root, '--json']);
        runCodex(['plugin', 'add', 'epp@epp-local', '--json']);
      } else if (added) runCodex(['plugin', 'marketplace', 'remove', 'epp-local', '--json']);
    } catch (restoreError) {
      restored = false;
      throw new Error(`应用失败且恢复未完成，备份保留在 ${backupFolder}：${restoreError.message}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (restored) rmSync(backupFolder, { recursive: true, force: true });
  }
  return {
    configFile,
    pluginId: 'epp@epp-local',
    serviceUrl: mcp.mcpServers.epp.url,
    clientId: mcp.mcpServers.epp.oauth.clientId,
    redirectUri: mcp.mcpServers.epp.oauth.callbackUrl,
  };
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const result = applyUserConfig();
    console.log(JSON.stringify(result, null, 2));
    console.log(
      '请在目标 EPP 服务预登记上述 clientId 与精确 redirectUri。切换 URL 后重新授权，再打开新对话；必要时重启 Codex。',
    );
  } catch (error) {
    console.error(`未完成应用用户配置：${error.message}`);
    process.exitCode = 1;
  }
}
