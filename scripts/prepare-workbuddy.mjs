import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrialConfig, prepareTrial } from './prepare-mcp-trial.mjs';

export const buildWorkbuddyConfig = (input) => buildTrialConfig(input, 'workbuddy');
export const prepareWorkbuddy = (options) => prepareTrial({ ...options, host: 'workbuddy' });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4)
      throw new Error('用法：npm run workbuddy:prepare -- <非秘密配置 JSON 路径> [输出目录]');
    const input = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
    console.log(JSON.stringify(prepareWorkbuddy({ input, outputRoot: process.argv[3] }), null, 2));
    console.log('仅生成本地试用材料；未登记客户端、安装代理、授权或连接 WorkBuddy。请按 README 完成配置。');
  } catch (error) {
    console.error(`WorkBuddy 试用准备失败：${error.message}`);
    process.exitCode = 1;
  }
}
