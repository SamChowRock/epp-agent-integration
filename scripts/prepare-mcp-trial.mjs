import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMcpConfig } from '../plugins/epp/scripts/apply-user-config.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skills = ['record-expressions', 'practice-expressions'];
const scope = 'records:read records:write candidates:accept practice:read practice:write';
const hosts = {
  doubao: { name: '豆包', callbackPort: 8769 },
  workbuddy: { name: 'WorkBuddy ', callbackPort: 8771 },
};

export function buildTrialConfig(input, host) {
  if (!Object.hasOwn(hosts, host)) throw new Error('未知试用宿主');
  const { url, oauth } = buildMcpConfig({
    ...input,
    clientId: input?.clientId ?? `epp-${host}-local`,
    callbackPort: input?.callbackPort ?? hosts[host].callbackPort,
  }).mcpServers.epp;
  if (oauth.clientId.includes('${'))
    throw new Error('clientId 不能包含代理会展开的环境变量模板。');
  return {
    connector: {
      type: 'stdio',
      command: 'npx',
      args: [
        '-y',
        'mcp-remote@0.15.2',
        url,
        String(oauth.callbackPort),
        '--host',
        'localhost',
        '--transport',
        'http-only',
        '--static-oauth-client-info',
        JSON.stringify({ client_id: oauth.clientId }),
        '--static-oauth-client-metadata',
        JSON.stringify({ token_endpoint_auth_method: 'none', scope }),
        '--resource',
        url,
        ...(url.startsWith('http:') ? ['--allow-http'] : []),
      ],
    },
    registration: {
      clientId: oauth.clientId,
      name: `EPP ${hosts[host].name}个人试用`,
      redirectUris: [`http://localhost:${oauth.callbackPort}/oauth/callback`],
      candidateConfirmation: 'epp_page',
    },
  };
}

export function prepareTrial({
  host,
  input,
  sourceRoot = workspace,
  outputRoot = join(workspace, `.local/${host}-trial`),
}) {
  const { connector, registration } = buildTrialConfig(input, host);
  const source = realpathSync(sourceRoot);
  const sources = skills.map((name) => {
    const file = join(source, 'plugins/epp/skills', name, 'SKILL.md');
    if (!lstatSync(file).isFile() || realpathSync(file) !== file)
      throw new Error(`Skill 必须是普通文件，路径不能包含符号链接：${name}`);
    return file;
  });
  const output = resolve(outputRoot);
  if (lstatSync(output, { throwIfNoEntry: false }))
    throw new Error(`试用目录已存在，保留原配置及凭据：${output}`);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  try {
    for (const [flag, file] of [
      ['--static-oauth-client-info', 'oauth-client-info.json'],
      ['--static-oauth-client-metadata', 'oauth-client-metadata.json'],
    ]) {
      const index = connector.args.indexOf(flag) + 1;
      writeFileSync(join(output, file), connector.args[index] + '\n');
      connector.args[index] = `@${join(output, file)}`;
    }
    const config = {
      mcpServers: {
        epp: { ...connector, env: { MCP_REMOTE_CONFIG_DIR: join(output, 'auth') } },
      },
    };
    writeFileSync(join(output, `${host}-mcp.json`), JSON.stringify(config, null, 2) + '\n');
    writeFileSync(join(output, 'epp-client.json'), JSON.stringify(registration, null, 2) + '\n');
    skills.forEach((name, index) => {
      const directory = join(output, name);
      mkdirSync(directory);
      copyFileSync(sources[index], join(directory, 'SKILL.md'));
      execFileSync('zip', ['-X', '-q', join(output, `${name}.zip`), 'SKILL.md'], {
        cwd: directory,
      });
    });
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
  return {
    directory: output,
    registration,
    skills: skills.map((name) => join(output, `${name}.zip`)),
  };
}

