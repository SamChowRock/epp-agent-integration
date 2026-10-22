# EPP Agent Integration

在 Agent 对话中记录并练习英语表达。Agent 自身 AI 整理和润色候选、出题、评估原始答案；EPP 服务保存记录、校验结果，并在用户确认后采纳候选与处理掌握证据。

本源码包含插件、记录/练习/随机练习三个 Skill、MCP 连接配置及配置脚本。EPP 核心和 MCP 服务端独立运行，源码不随包提供；安装插件不会安装 EPP 服务、创建账号或开放服务访问权。使用前需要管理员提供可访问的 EPP 服务、账号及已预登记的 OAuth 客户端。

## 环境与验证范围

- 安装脚本只使用 Node.js 内置模块，无需 pnpm、私有依赖或 EPP 源码仓库。
- 本地分发检查使用 Node.js 24.19.0；既有宿主接入证据使用 Codex CLI 0.162.0-alpha.17.2。升级宿主版本后须重新核对 OAuth 回跳兼容性。
- 已有本地 CLI 记录、练习与恢复证据，以及插件 17 个工具发现证据；桌面实际使用、云端 ChatGPT 及生产服务仍待各自验证。配置回归使用模拟宿主命令，不连接真实账号或证明桌面闭环。
- 本分发不承诺通用公共插件目录收录或跨宿主兼容。它通过本地插件来源安装；目录布局参照 [OpenAI 插件文档](https://developers.openai.com/plugins/build/plugins)。

## 安装与配置

下载并解压分发 ZIP，或取得完整公开源码目录；保留 `.agents`、`.codex-plugin` 和 `.mcp.json` 等隐藏文件。以下命令从分发根目录运行。

1. 安装 Node.js 与支持插件命令的 Codex CLI。
2. 在 `~/.codex/epp/user-config.json` 配置目标服务。已有文件请直接编辑并保留自己的配置；首次创建时可参照包内的 `plugins/epp/user-config.example.json`。未创建文件时，安装脚本会生成默认的 `http://localhost:3000` 配置。

```json
{
  "serviceUrl": "https://your-epp.example",
  "clientId": "epp-codex-local",
  "callbackPort": 8767
}
```

`serviceUrl` 接受 HTTPS 或本地回环 HTTP，路径为空、`/` 或 `/api/mcp`；不能包含用户名、密码、查询参数、片段或自定义路径前缀。`clientId`、`callbackPort` 可以省略，默认值如上；它们必须与目标服务的预登记信息一致。

3. 应用配置并安装个人插件：

```sh
node plugins/epp/scripts/apply-user-config.mjs
```

脚本生成 `~/.codex/epp/marketplace/`，通过 Codex CLI 登记本地来源并安装 `epp@epp-local`，输出当前服务 URL、clientId 和精确 redirectUri。让服务管理员在目标服务预登记该 clientId 和 redirectUri，再进行授权；HTTPS URL 配置本身不代表对应服务已上线。

4. 授权记录与练习所需权限：

```sh
codex mcp login epp --scopes records:read,records:write,candidates:accept,practice:read,practice:write
```

使用目标 EPP 账号登录并亲自确认权限，然后打开新对话。插件入口未刷新时重新启动宿主。在插件目录中选择“EPP 本地插件”来源核对安装和启用状态。

OAuth 账号密码和令牌由宿主认证机制保存，不写入用户 JSON、插件包或对话工具参数。授权首次兑换起固定有效 30 天，访问令牌有效 15 分钟并由宿主自动刷新；到期、撤销或刷新失败后重新登录。切换服务 URL 后须在新服务重新授权，原授权不会自动获得练习权限。

当前宿主不运行 Claude `userConfig` 安装表单，因此本包使用文件配置与应用脚本；参见 [OpenAI 兼容说明](https://developers.openai.com/plugins/guides/submit-claude-plugin#replace-claude-userconfig)。

## 使用

- 记录：“用 EPP 记录这个表达，先展示候选，等我确认后采纳。”每批最多 20 条，确认时可以选择全部、部分或取消；未选中不等于放弃。
- 练习：“用 EPP 练习我已收录的表达，一次一道题。”用户答案逐字保存；提示和参考在展示前记录辅助使用，自评由用户自己选择。
- 恢复：“恢复我在 EPP 的这次记录或练习，先读取已保存状态。”保留服务返回的业务身份，未知结果先查询，不能换身份重复写入。

需要选择已收录表达时，使用当前服务返回的 Web 星图入口。只有采纳的候选进入正式记录；向量待处理或失败不撤销已采纳事实。账号授权、工具许可和候选采纳是不同动作。


## Codex 随机练习配置

随机练习入口为源码根目录下的 `plugins/epp/skills/schedule-practice/SKILL.md`，其目录同时包含非秘密配置样例与随机时段脚本。以下命令从源码根目录运行。本扩展不会自行注册 Schedule，随机时间配置也不能直接写入用于服务连接的 `user-config.json`。只在任务提示中写“随机提醒”，不能保证每天的次数或避免重复。

```json
{
  "timezone": "Asia/Shanghai",
  "window": { "start": "10:00", "end": "21:00" },
  "dailyCount": { "min": 3, "max": 4 }
}
```

先用 Node.js 22 或更新版本运行本地检查；示例状态路径由公开根目录的 `.gitignore` 排除，个人配置也应放在 `.local/` 下：

```sh
node plugins/epp/skills/schedule-practice/scripts/random-slots.mjs check \
  --config plugins/epp/skills/schedule-practice/config.example.json \
  --state .local/practice-schedule/state.json
```

再按以下规则在支持插件的 Codex 宿主中配置任务，完整操作、确认去重及暂停/恢复规则见 Skill；定时任务入口见 [Scheduled tasks 官方说明](https://learn.chatgpt.com/docs/automations?surface=app)。旧 v0.1.2 Release/ZIP 不含随机练习扩展，需要取得包含上述目录的最新源码并重新应用插件配置；更新源码不会自动更新旧附件、个人安装或启用任务。

- 使用同一个练习对话。先手动确认 EPP 服务可达、当前对话能调用练习工具、已授予 `practice:read / practice:write`，且练习池材料允许发送到当前宿主；缺少条件时保持任务暂停。
- 默认每天在北京时间 10:00–21:00 内每半小时检查一次，从中随机选择 3 或 4 个不同的时段，并保存当天计划。窗口不包含 21:00，最后候选为 20:30；重复检查沿用原计划，错过不集中补发。
- 有未完成题时提醒继续原题，有已评估但未自评的结果时等待用户选择；只有确认没有当前尝试才开始一道新题。题目保存后再展示，不提前给答案；用户答案逐字保存，自评仍由用户自己选择。
- 将创建任务时实际返回的 `automationId` 绑定到该任务提示。运行中失去工具、服务、权限或材料授权时，停止业务调用并暂停对应任务，保留其他设置、日计划和业务身份；暂停失败须明确报告，不能宣称后续调度已停止。恢复须用户明确要求，重新核对条件并手动验证后再启用原任务。
- 业务写入响应未知时先按原身份查询，不换身份重复开始。配置与状态文件使用稳定路径；个人任务身份、账号、令牌、题目和答案不进入共享配置或 Git。

此方式默认约有 22 次后台检查/天，实际练习提醒为其中随机选中的 3 或 4 次；后台检查也可能消耗宿主用量。本地运行需要电脑、Codex 和 EPP 服务可用，离线或故障可能使实际提醒次数减少。真实定时触发、故障后的自动暂停与通知投递仍须在实际宿主验证。

## 升级与恢复

取得新的完整分发目录后，重新运行其中的配置脚本；已有用户 JSON 保留。URL、客户端或回跳变化时先核对服务预登记，再重新授权。安装失败会尝试恢复原来源与生成文件；若输出“恢复未完成”，按提示保留备份并让管理员处理。同名来源包含其他插件或不是本地来源时，脚本会停止，避免覆盖它们。

服务不可达时先核对服务是否运行和 URL 是否正确；授权失败时核对 clientId、精确回跳、账号及权限。连接恢复后用原业务身份查询事实，不将响应丢失解释为没有保存成功。不要把账号、令牌、原始材料或答案附在公开问题中。

## 本地配置回归

```sh
node --test plugins/epp/tests/user-config.test.mjs
```

回归仅操作临时目录并模拟宿主命令，覆盖配置、升级、失败恢复及目录保护，不修改个人插件安装或业务数据。

## 公开边界与许可

任务所需规则、schema、输入与结果会提供给授权 Agent，宿主可能记录这些内容；这些运行时内容不对宿主保密。配置脚本不包含服务密钥、账号或令牌。插件也不豁免宿主、EPP 服务及 Embedding 的数据条款和费用。

本包源码与说明采用 MIT，版权署名为 shenzhou，见包内 `LICENSE`。MIT 许可范围仅为本包，不授予闭源 EPP 服务端源码或用户数据的权利。Node.js 与 Codex CLI 由用户另行安装，本包不捆绑第三方运行时或第三方代码副本。

贡献请使用合成示例和配置回归，不提交私有材料、凭据或数据库。维护者 Review 后统一更新插件来源并发布新版本；完整生成契约由目标服务按任务返回。
