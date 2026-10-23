import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publicPluginScope = {
  roots: ['plugins/epp/', '.agents/plugins/marketplace.json'],
  rootFiles: ['README.md', 'LICENSE', '.gitignore'],
  excludes: [
    '(^|/)(\\.git|\\.local|node_modules|dist|coverage)(/|$)',
    '(^|/)(\\.env(?:\\..*)?|user-config\\.json|credentials\\.json|tokens?\\.json)$',
    '\\.(pem|key|p12|pfx|log)$',
  ],
};

export function getPublicPluginFiles(sourceRoot = workspace, commit) {
  const args = commit
    ? ['ls-tree', '-rz', '--name-only', '--full-tree', commit]
    : ['ls-files', '-z'];
  const paths = execFileSync('git', ['-C', sourceRoot, ...args, '--', ...publicPluginScope.roots], {
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  })
    .split('\0')
    .filter(Boolean);
  const files = Object.fromEntries(
    paths
      .filter(
        (file) =>
          !publicPluginScope.excludes.some((pattern) => new RegExp(pattern, 'i').test(file)),
      )
      .map((file) => [file, file]),
  );
  for (const required of [
    'plugins/epp/.codex-plugin/plugin.json',
    'plugins/epp/README.md',
    'plugins/epp/LICENSE',
    '.agents/plugins/marketplace.json',
  ]) {
    if (!files[required]) throw new Error(`公开目录缺少必要跟踪文件：${required}`);
  }
  for (const file of publicPluginScope.rootFiles) {
    const source = `plugins/epp/${file}`;
    if (files[source]) files[file] = source;
  }
  return files;
}

export function exportEppPlugin({
  sourceRoot = workspace,
  outputRoot = join(workspace, '.local/releases'),
} = {}) {
  const source = realpathSync(sourceRoot);
  const publicPluginFiles = getPublicPluginFiles(sourceRoot);
  for (const file of Object.values(publicPluginFiles)) {
    const path = join(source, file);
    if (!lstatSync(path).isFile() || realpathSync(path) !== path)
      throw new Error(`公开源文件必须是普通文件，路径不能包含符号链接：${file}`);
  }
  const { version } = JSON.parse(
    readFileSync(join(source, 'plugins/epp/.codex-plugin/plugin.json'), 'utf8'),
  );
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error('插件版本必须是可安全用作目录名的版本号。');
  const output = resolve(outputRoot);
  const name = `epp-agent-integration-${version}`;
  const directory = join(output, name);
  const archive = join(output, `${name}.zip`);
  const inventory = join(output, `${name}.files.json`);
  for (const path of [directory, archive, inventory])
    if (lstatSync(path, { throwIfNoEntry: false }))
      throw new Error(`分发产物已存在，保留原产物：${path}`);
  mkdirSync(output, { recursive: true });
  mkdirSync(directory);
  try {
    for (const [target, file] of Object.entries(publicPluginFiles)) {
      mkdirSync(dirname(join(directory, target)), { recursive: true });
      copyFileSync(join(source, file), join(directory, target));
    }
    execFileSync(
      'zip',
      ['-X', '-q', archive, ...Object.keys(publicPluginFiles).map((file) => `${name}/${file}`)],
      {
        cwd: output,
        stdio: 'pipe',
      },
    );
    writeFileSync(
      inventory,
      JSON.stringify({ version, files: Object.keys(publicPluginFiles).sort() }, null, 2) + '\n',
      { flag: 'wx' },
    );
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    rmSync(archive, { force: true });
    throw error;
  }
  return { version, directory, archive, inventory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(exportEppPlugin(), null, 2));
  } catch (error) {
    console.error(`插件导出失败：${error.message}`);
    process.exitCode = 1;
  }
}
