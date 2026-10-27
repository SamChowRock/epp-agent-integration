# EPP Agent Integration

[![Platform: OpenAI Codex](https://img.shields.io/badge/platform-OpenAI%20Codex-000000)](https://developers.openai.com/plugins/build/plugins)
[![豆包工作：个人试用](https://img.shields.io/badge/%E8%B1%86%E5%8C%85%E5%B7%A5%E4%BD%9C-%E4%B8%AA%E4%BA%BA%E8%AF%95%E7%94%A8-3370FF)](#豆包工作个人试用)
[![WorkBuddy：个人试用](https://img.shields.io/badge/WorkBuddy-%E4%B8%AA%E4%BA%BA%E8%AF%95%E7%94%A8-2B8A3E)](#workbuddy-个人试用)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP-blue)](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
[![CI](https://github.com/SamChowRock/epp-agent-integration/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SamChowRock/epp-agent-integration/actions/workflows/ci.yml?query=branch%3Amain)
[![Plugin version (main)](https://img.shields.io/github/package-json/v/SamChowRock/epp-agent-integration/main?filename=plugins%2Fepp%2F.codex-plugin%2Fplugin.json&label=plugin)](https://github.com/SamChowRock/epp-agent-integration/blob/main/plugins/epp/.codex-plugin/plugin.json)
[![License](https://img.shields.io/github/license/SamChowRock/epp-agent-integration)](LICENSE)

本仓库独立维护插件与 Skills；贡献直接在本仓 Review 和合并，不回收到私有 EPP 仓，也不由私有仓复制覆盖。维护检查运行 `npm test`，打包运行 `npm run pack`；不会自动发布 Release 或更改个人安装。

在 Agent 对话中记录并练习英语表达。Agent 自身 AI 整理和润色候选、出题、评估原始答案；EPP 服务保存记录、校验结果，并在用户确认后采纳候选与处理掌握证据。

本源码包含插件、记录/练习/随机练习三个 Skill、MCP 连接配置及配置脚本。EPP 核心和 MCP 服务端独立运行，源码不随包提供；安装插件不会安装 EPP 服务、创建账号或开放服务访问权。使用前需要管理员提供可访问的 EPP 服务、账号及已预登记的 OAuth 客户端。

## 源码仓命令与目录

在本仓根目录使用以下入口；无需安装 npm 依赖。

| 命令 | 用途 |
| --- | --- |
| `npm run plugin:configure` | 应用个人连接配置并安装或更新本地插件 |
| `npm run doubao:prepare -- <配置 JSON> [输出目录]` | 准备豆包个人试用的本地 STDIO 连接配置与两份 Skill 包，不安装或授权 |
| `npm run workbuddy:prepare -- <配置 JSON> [输出目录]` | 准备 WorkBuddy 个人试用的独立连接配置与两份 Skill 包，不安装或授权 |
| `npm run practice:schedule -- check ...` | 检查随机练习时段；`ack` 使用相同入口并传入提醒身份 |
| `npm test` | 运行全部回归 |
| `npm run test:config` | 配置、安装与失败恢复回归 |
| `npm run test:schedule` | 随机练习状态与 CLI 回归 |
| `npm run test:pack` | ZIP 内容及解压后的独立运行回归 |
| `npm run pack` | 生成本地分发 ZIP，不发布 |

脚本按作用范围归位：[仓库 scripts/](scripts/) 负责打包维护，[插件 scripts/](plugins/epp/scripts/) 负责插件配置，[Skill scripts/](plugins/epp/skills/schedule-practice/scripts/) 只服务对应 Skill。npm 命令直接调用这些脚本，不维护副本或额外转发脚本。新增脚本按同一规则维护，见[贡献说明](CONTRIBUTING.md)。

分发 ZIP 不包含源码仓的 `package.json`；下载用户和已安装插件使用下文对应的直接 `node` 命令，操作说明随插件打包。

## 环境与验证范围

- 安装脚本只使用 Node.js 内置模块，无需 pnpm、私有依赖或 EPP 源码仓库。
- 本地分发检查使用 Node.js 24.19.0；既有宿主接入证据使用 Codex CLI 0.162.0-alpha.17.2。升级宿主版本后须重新核对 OAuth 回跳兼容性。
- 已有本地 CLI 记录、练习与恢复证据，以及插件 17 个工具发现证据；Codex 桌面复查、云端 ChatGPT 及生产服务仍按各自范围验收。WorkBuddy 桌面个人试用的完整短句流程已验证，范围见下文。配置回归使用模拟宿主命令，不连接真实账号或证明桌面闭环。
- 本分发不承诺通用公共插件目录收录或跨宿主兼容。它通过本地插件来源安装；目录布局参照 [OpenAI 插件文档](https://developers.openai.com/plugins/build/plugins)。

## 安装与配置

下载并解压分发 ZIP，或取得完整公开源码目录；保留 `.agents`、`.codex-plugin` 和 `.mcp.json` 等隐藏文件。以下按源码仓与分发 ZIP 分别说明入口，均从各自根目录运行。

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

3. 源码仓应用配置并安装个人插件：

```sh
npm run plugin:configure
```

分发 ZIP 解压后，从分发根目录运行：

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

## 豆包工作个人试用

这是本地个人试用入口。本机已验证用户亲自授权、代理复用授权以及豆包连接器安装并启用；同版代理客户端发现 17 个工具。Skill 导入、豆包模型实际使用、记录和练习仍待验证。[豆包帮助中心](https://www.doubao.com/work/docs/zh-cn/articles/705018132598-plugins)支持个人添加 STDIO 插件，[技能帮助](https://www.doubao.com/work/docs/zh-cn/articles/081010973544-skills)支持上传技能文件或文件夹。无需先申请企业上架；这里不生成商店插件包，也不启用 Codex 专用随机练习。

连接方式为豆包本地 STDIO → [mcp-remote](https://github.com/punkpeye/mcp-remote/tree/v0.15.2) → EPP HTTP MCP，代理固定使用 `0.15.2`，负责浏览器登录、S256、resource 和刷新。EPP 继续使用预登记 public client、既有 scope 与确认页，不修改 OAuth 服务，不开放公网服务。代理能力与本地配置检查不能代替豆包真实使用验收。

从本源码仓运行，使用现有 Node.js 24 和可执行的 `npx`、`zip`。新建 `.local/doubao-user-config.json`（该目录已忽略），例如：

```json
{
  "serviceUrl": "http://localhost:3000",
  "clientId": "epp-doubao-local",
  "callbackPort": 8769
}
```

`serviceUrl` 必须与 EPP 实际 API origin 一致，不把 `localhost` 与 `127.0.0.1` 任意互换；URL 和端口沿用已有安全校验。客户端与端口默认如上，避免复用 Codex 授权身份。配置不能放入账号或令牌。

```sh
npm run doubao:prepare -- .local/doubao-user-config.json
```

默认生成目录为 `.local/doubao-trial/`，也可传第二个参数指定仓库外目录。macOS 的“文稿”等受保护目录可能使豆包启动脚本或读取配置时阻塞；本机已观察到移到临时目录后代理才能进入 OAuth。可从终端重新生成到个人配置目录，例如：

```sh
npm run doubao:prepare -- .local/doubao-user-config.json "$HOME/.config/epp/doubao-trial"
```

输出包含 `doubao-mcp.json`、`epp-client.json`、两份非秘密 OAuth 客户端 JSON、两个 Skill 文件夹及各自 ZIP。代理参数通过 `@绝对路径` 读取客户端 JSON，避免在宿主参数框嵌套带空格的 JSON；不要单独移动这些文件。生成过程不运行代理、安装软件、登记服务端客户端或打开登录页；已有目录会拒绝覆盖，保留其中可能已存在的凭据。输出目录须保持私有；临时目录仅用于诊断，不能作为长期运行位置。

1. 让 EPP 管理员将 `epp-client.json` 作为一项加入 `MCP_OAUTH_CLIENTS`，保留其他客户端并按既有方式重启服务。默认精确回跳是 `http://localhost:8769/oauth/callback`，与 Codex 的 callback 路径不同；端口须空闲，固定端口被占用时停止处理。
2. 在豆包工作的本地电脑模式中添加自定义 STDIO 插件，按 `doubao-mcp.json` 填写运行命令、完整参数和环境变量。该文件是配置参考，未验证豆包支持直接导入 JSON。`npx` 必须在宿主 PATH 可达；找不到时使用本机 `npx` 的实际绝对路径并配置 Node.js 所在 PATH。首次启动需要从 npm 下载指定版本代理。
3. 代理打开 EPP 登录页后，由用户登录并核对五项记录/练习权限。令牌由代理保存在生成目录的 `auth/`，不进入参数、对话或源码；上游采用权限受限的本地明文文件，不使用 Codex 凭据存储。保持此目录私有，不上传或分享整个试用目录，也不开启代理 debug 日志。
4. 在豆包技能页面分别上传生成的 `record-expressions`、`practice-expressions` 文件夹，或在实际入口支持时上传对应 ZIP。两份 Skill 原文直接来自共享源文件；个人导入不要求套用开发者商店的额外展示配置。
5. 先发现完整授权下的 17 个工具，再用合成材料完成一次记录、用户亲自选择确认、查询采纳事实和一次练习；访问到期后的刷新、撤销与原身份恢复分别验证。只发现工具不能报告为记录或练习通过。

本机豆包首次连接未等到人工登录完成就结束了代理。遇到这种情况，先在交互式终端使用同版代理自带客户端完成授权，再由豆包复用同一 `MCP_REMOTE_CONFIG_DIR`。以下命令对应上方 localhost、8769 和个人配置目录示例；服务 URL、resource、端口及文件路径必须与实际生成配置一致。HTTPS 服务不需要 `--allow-http`。

```sh
doubao_trial_dir="$HOME/.config/epp/doubao-trial"
MCP_REMOTE_CONFIG_DIR="$doubao_trial_dir/auth" \
  npx -y --package=mcp-remote@0.15.2 mcp-remote-client \
  http://localhost:3000/api/mcp 8769 --host localhost --transport http-only \
  --static-oauth-client-info "@$doubao_trial_dir/oauth-client-info.json" \
  --static-oauth-client-metadata "@$doubao_trial_dir/oauth-client-metadata.json" \
  --resource http://localhost:3000/api/mcp --allow-http --auth-timeout 600
```

该客户端只初始化连接并查询工具与资源列表，不调用记录或练习工具。保持终端输入打开，等待 `Tools` 和 `Exiting OK` 后再结束；仅有退出码 0 不证明工具列表已返回。随后在豆包中保存或重启原连接器，不复制令牌或新建授权身份。

服务未启动、客户端未登记、豆包未安装/登录、浏览器回跳失败或宿主启动参数不兼容时，停在具体缺口，不改用手工 Bearer Token。切换账号、服务或客户端时先停止该 STDIO 连接并核对授权，不清理仍有代理进程使用的目录；已有试用目录不会被准备命令自动重建。

本入口只在源码仓提供；现有 Codex 分发 ZIP 和安装配置保持原行为。商店上架另需符合[插件开发规范](https://open.doubao.com/document/doubao-developer-guide/plugin-development-specification)，其远程 HTTPS 限制不能直接套作本地 STDIO 代理的联网要求，也不能用本地试用结果承诺商店支持。


## WorkBuddy 个人试用

WorkBuddy 的[连接器说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)支持自定义 MCP，[技能说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)支持上传技能包。这里沿用上节的 STDIO → `mcp-remote@0.15.2` → EPP HTTP MCP 路径；本机 5.8.3 已使用独立 OAuth 授权发现 17 个工具、加载两份 Skill，代理刷新和重启后恢复不需要重新授权。

**当前验收边界：**隔离合成账号已用普通短句完成记录、系统浏览器确认页采纳、加入练习池、换题、原答案保存、评估和明确自评的完整流程；另有练习恢复、新出题和“好”不代选自评的验证，自评后没有自动开题。最新轮的页面采纳、答案和感受由用户明确委托助手模拟操作，不代表用户亲自输入或学习效果。宿主用户请求中没有提供工具名、业务身份或调用参数；此前人工编排轮与本轮证据分开记录。

新建已忽略的 `.local/workbuddy-user-config.json`：

```json
{
  "serviceUrl": "http://localhost:3000",
  "clientId": "epp-workbuddy-local",
  "callbackPort": 8771
}
```

```sh
npm run workbuddy:prepare -- .local/workbuddy-user-config.json "$HOME/.config/epp/workbuddy-trial"
```

省略输出目录时使用 `.local/workbuddy-trial/`。生成 `workbuddy-mcp.json`、`epp-client.json`、两份代理 OAuth JSON，以及与共享源文件内容一致的记录、练习 Skill 文件夹和 ZIP。已有目录拒绝覆盖；默认客户端和回跳端口独立于 Codex、豆包，凭据保存在本目录的 `auth/`，不能复制其他宿主的令牌。

1. 按上节方法将客户端加入 EPP 的 `MCP_OAUTH_CLIENTS`，保留其他客户端；默认精确回跳为 `http://localhost:8771/oauth/callback`。
2. 在 WorkBuddy 的“专家·技能·连接器 → 连接器 → 自定义连接器”打开 MCP 配置，保留已有服务器，加入生成文件的 `mcpServers.epp`。使用实际可执行的命令与 Node.js PATH；配置文件和代理脚本须在宿主可读取的稳定路径。
3. 由用户核对 EPP 应用名及五项权限并授权。首次等待被宿主中断时，按上节交互式客户端方式预授权，换用本次服务、8771、WorkBuddy 文件路径及同一个独立凭据目录。
4. 在“技能 → 添加技能 → 上传技能”分别上传两个 Skill 包；只上传 Skill ZIP 或对应文件夹，不上传包含授权凭据的整个试用目录。
5. 分别核实宿主发现 17 个工具、两个 Skill 加载、合成记录与用户确认、练习、刷新、撤销与原身份恢复。准备脚本和代理工具发现不代表 WorkBuddy 业务验收完成；本入口不启用 Codex 随机练习。

日常对话验收使用新对话和隔离合成账号，每轮只发普通用户会说的话：记录表达 → “收录” → 用户在确认页亲自选择 → “已采纳” → “练一下” → 英语答案 → “掌握了”或“还要练”。“好”不能被代选成自评。宿主须自行读取 Skill、取得工具返回的身份并完成保存；测试者若补充工具顺序、UUID、schema 或参数，该轮只能算人工编排。中断后用“继续刚才的练习”验证原答案和原尝试恢复，不能重新建题代替恢复。工具轨迹和只读服务检查用于核对事实，不放进用户请求充当提示。

共享 Skill 已统一简短反馈、自评收尾与选题边界，保留参数完整性和有界恢复规则。采纳后要求练习会另行加入练习池，以工具成功结果为准，避免把“已收录”误报成“已加入”。更新后请新建对话，已有对话可能仍持有旧 Skill。真实宿主已覆盖只有一条可用表达时如实说明无法换题，以及有另一条表达时成功换题。现有工具从练习池选题，不能保证任意指定表达都能直接出题。

候选提交曾因调用链路把必填的 `null` 改成空字符串而失败。EPP 服务端已调整 MCP 输入描述的互斥分支表示，保留原参数和业务校验；更新后真实宿主一次提交成功。该服务端兼容修复须与 Skill 一起使用，单独升级 Skill 不能修复传输值改写。尚未覆盖全部工具、撤销、真实向量和广泛语言质量；原生 OAuth 动态注册、商店连接器、专家包及生产部署不在本次个人试用范围内。

候选确认优先使用系统浏览器，复用 EPP 授权时的登录状态。WorkBuddy 内置预览与系统浏览器的登录状态可能不同；本机同一确认链接在内置预览要求登录，在已登录的 Chrome 直接显示候选，不需要重新授权连接器。[官方打开方式](https://www.workbuddy.cn/docs/workbuddy/Conversation#打开对话中的链接)支持右键“在浏览器打开”，或按住 Command（macOS）/Ctrl（Windows）点击链接；本地链接可能仍默认在内置预览打开。两份 Skill 保留候选由用户亲自选择的要求。

## Codex 随机练习配置

随机练习入口为源码根目录下的 `plugins/epp/skills/schedule-practice/SKILL.md`，其目录同时包含非秘密配置样例与随机时段脚本。以下命令从源码根目录运行。本扩展不会自行注册 Schedule，随机时间配置也不能直接写入用于服务连接的 `user-config.json`。只在任务提示中写“随机提醒”，不能保证每天的次数或避免重复。

```json
{
  "timezone": "Asia/Shanghai",
  "window": { "start": "10:00", "end": "21:00" },
  "dailyCount": { "min": 3, "max": 4 }
}
```

在源码仓使用 `package.json` 声明的 Node.js 版本运行本地检查；示例状态路径由仓库根目录的 `.gitignore` 排除，个人配置也应放在 `.local/` 下：

```sh
npm run practice:schedule -- check \
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
npm run test:config
```

回归仅操作临时目录并模拟宿主命令，覆盖配置、升级、失败恢复及目录保护，不修改个人插件安装或业务数据。

## 公开边界与许可

任务所需规则、schema、输入与结果会提供给授权 Agent，宿主可能记录这些内容；这些运行时内容不对宿主保密。配置脚本不包含服务密钥、账号或令牌。插件也不豁免宿主、EPP 服务及 Embedding 的数据条款和费用。

本包源码与说明采用 MIT，版权署名为 shenzhou，见包内 `LICENSE`。MIT 许可范围仅为本包，不授予闭源 EPP 服务端源码或用户数据的权利。Node.js 与 Codex CLI 由用户另行安装，本包不捆绑第三方运行时或第三方代码副本。

贡献请使用合成示例和配置回归，不提交私有材料、凭据或数据库。维护者 Review 后统一更新插件来源并发布新版本；完整生成契约由目标服务按任务返回。
