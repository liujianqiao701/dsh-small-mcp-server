# PORTING.md — 从 0.1.x 上游移植到 DSH 0.2，并适配当前 0.2.2-rc.3

本包基于**一份为 DSH 0.1.x 编写的 MCP 设置面板**（MIT，上游 v0.1.2）移植而来，
目标是让它在 **DSH 0.2**（`0.2.0-rc.2` 实测）上可用；随后又适配了
**DSH `0.2.2-rc.3`**（2026-11-16 实测，见第三节「0.2.2-rc.3 适配」）。

上游最后发布于 2026-08-19，共 3 个版本，之后未再维护。

---

## 一、上游在 0.2 上为什么加载不起来

**唯一的致命坏点是 TYPERT codec 的形状**（第 1 条，已用反证测试 + 浏览器实测双向证实）。
该形状在包里有**三份副本**，其中**打包产物 `lib/client.js`**（`exports["./client"].default`
指向它，即浏览器真正加载的入口）那一份才是让插件在页面上响起的坏点——只改宿主那份会让
宿主侧一切正常、而客户端 fiber 在浏览器里激活失败。第 2 条是失效声明——不致命，
但会误导排查，故一并清理。

### 1. TYPERT codec 的形状变了（宿主 + 客户端两份副本，响亮失败）

上游 `lib/typert.js`、`lib/client/typert-remote.js`、以及打包产物 `lib/client.js` 里生成的是：

```js
{ mode: "strict", typeSymbol, schema }          // 0.1.x 形状
```

DSH 0.2 的 `@deepseek-ai/dsh-typert-protocol` 定义并要求：

```ts
export type TypertCodec = {
    readonly mode: 'strict';
    readonly typeSymbol: string;
    readonly create: () => TypertSchema;        // 0.2 要的是惰性工厂
    ...
}
```

而 `@deepseek-ai/dsh-typert-loader@0.2.0-rc.2` 的校验器是硬校验：

```js
if (typeof codec.create !== "function")
    throw new Error(`typert-loader: ${pkgName} ${subject} has no create() factory`);
```

（`lib/index.js` 的 `requireStrictCodec()`）

该 loader 对「已声明但坏了」的构件是**响亮失败**（manifest 校验错误会被聚合成插件
的 activation throw），所以上游插件在 0.2 上挂载即失败。

**修复**：`schema` → `create: () => schema`，共 6 处 helper —— `lib/typert.js`（宿主清单）2 处、
**`lib/client.js`（打包产物，浏览器加载的就是这个文件）2 处**、
`lib/client/typert-remote.js`（非入口的源副本，属遗漏清理）2 处。

**客户端那份失败的表现形式**（与宿主完全不同，容易误判）：宿主侧**静默通过**，
页面上弹出一条横幅：

```
HARNESS / Failed to load plugins
dsh-small-mcp-server
web boot: 1 entry did not activate
dsh-small-mcp-server: failed
```

该文案来自 `dsh-web-frontend` 的前端启动代码：它 `await import()` 每个客户端模块，
import 成功后再检查该 fiber 的状态，非 `active` 就 `push(`${id}: ${state}`)`
并抛出 `web boot: N entries did not activate`。**注意它没打 `import failed`**——
所以「模块下载/解析成功、激活时抛异常」与「模块加载失败」在横幅上长得几乎一样，
要靠是否出现 `import failed:` 前缀区分。宿主**不会**把这条打到 stdout/stderr，
所以「启动日志干净」在这里是**假阴性**：判定客户端半体必须用浏览器实测。

### 2. `dsh.client.inject` 里有一条已从核心里移除的包（**不致命**）

上游声明：

```json
"dsh": { "client": { "inject": [
  "@deepseek-ai/dsh-client-runtime",   // ← 0.2 里整个包都不存在
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-api-remotes"
] } }
```

`@deepseek-ai/dsh-client-runtime` 在 DSH 0.2.0-rc.2 的 63 个 `dsh-client-*` 包里
**不存在**，全树也没有任何包引用它。客户端 bundle 从头到尾**只 `require()` 了
`react` 和 `react/jsx-runtime`**，从未 import 过 runtime。

**但它并不致命**——`dsh.client.inject` 在这里只是**加载顺序提示**，找不到的目标会被
静默跳过：

```js
// @deepseek-ai/dsh-client-modules/lib/client.js:653
for (const packageName of row.inject) {
    const dependency = this.graphRows.get(packageName);
    if (dependency !== void 0) await this.arriveDependency(row.id, dependency, [], visited);
}
```

宿主端（`lib/index.js:66`）也只做形状校验（`optionalStringArray`），不查存在性。
旁证：官方插件普遍注入同样没有 `dsh.client` 的 `@deepseek-ai/dsh-client-ui-primitives`
（如 `dsh-client-ui-jobs`、`dsh-client-ui-schedule`、`dsh-client-ui-subagent`），照常工作。

**处置**：仍从 `dsh.client.inject` / `peerDependencies` / `devDependencies` 中删除它。
目的是不留指向不存在包的声明，避免下一次排查被误导——不是它导致了挂载失败。
其余 4 条在 0.2 里都存在。


> **为什么市场的兼容判定没抓到这两点**：`dshmarket` 的 `deriveHostCompatibility()`
> 只读 `engines.dsh` 和 `peerDependencies`，**不看 `dsh.client.inject`**；而唯一的
> 客户端 peer 在 semver 上又被 `0.2.0-rc.2` 蒙对了（市场用
> `satisfiesRange(..., { includePrerelease: true })`，是宽松口径）。
> 「市场说兼容」≠「真能加载」。

---

## 二、本包做了什么

| 项 | 动作 |
| --- | --- |
| codec 形状 | `schema` → `create: () => schema`（**6 处** helper：宿主清单 `lib/typert.js` 2、**打包产物 `lib/client.js` 2**、非入口源副本 `lib/client/typert-remote.js` 2） |
| 启停交互（**有意偏离上游**） | 上游：开关只改本地草稿，须再点「保存」才生效。本 fork：点开关**立即**调 `mcp/save` 落盘并热更新，面板**不再出现**「保存 / 放弃修改」；新增、修改、移除仍走草稿 + 保存。另加**静默补刷**：保存成功后 1.2s / 3.5s 各调一次 `mcp/list`（只 `setServers`，不置 `busy`、不动草稿），避免状态徽章停在「加载中」 |
| 客户端注入 | 删除 `@deepseek-ai/dsh-client-runtime`（3 处声明） |
| 包名 | 改为 `dsh-small-mcp-server`（宿主 `PKG` 常量、客户端 `TYPERT_REMOTE.package`、`__ModuleLoader__` 的 `id`、CSS tag id、`cordis.patch.yml` 的 `name` 全部同步；`validateTypertManifest` 要求 `manifest.package === 包名`） |
| bundle 行 id | `cordis.patch.yml` 的行 id 用 `dsh-small-mcp-server`（**不沿用上游旧 id**）：上游插件卸载后可能在 profile 补丁层留下同 id 的 `disabled: true` 残留行，同 id 插两次会让宿主**启动即退出** |
| 版本 | `0.1.2` → `0.1.0`（新包名，全新起点） |
| 依赖 | `zod` 从 `peerDependencies` 移到 `dependencies`（profile 用 `autoInstallPeers: false`，放 peer 不会被安装）；`js-yaml` 同 |
| peer 范围 | 所有 `@deepseek-ai/dsh-*` 收紧为 `>=0.2.0-rc.1 <0.3.0-0`；`cordis ^4.0.4`、`cordis-plugin-loader ^1.0.5`；新增 `dsh.engines.dsh` |
| exports | 删除 `"./src/*"`（npm 包里本就没有 `src/`） |
| scripts | 删除 `build` / `typecheck` / `test` / `bundle` / `release` / `lint` / `format` —— 上游的 `tsconfig.build.json`、`tsdown`、`scripts/wrap-client.mjs`、`src/`、`tests/` 都**没有**随 npm 包发布，这些脚本在本包里不可执行 |
| LICENSE | 版权行统一为 `Copyright (c) 2026 作者未公开`。⚠️ **上游的 MIT 版权声明已被移除**，这不再满足 MIT「再分发须保留原声明」的要求——仅因本包**不对外分发**而可接受；若将来要发布/上架，须先自行评估合规 |
| 去品牌化 | 移除旧包名 / npm 地址 / 作者 / 仓库引用（README、README.zh、package.json、PORTING.md）；面板上的「联系开发者」外链改为**无外链的占位**（显示「作者未公开」，`contact` locale key 与 `dshmcp-contact` 样式保留，但**不含 href**）；locale 命名空间改用 `dsh-small-mcp-server`，连带修正 `lib/types` 镜像与其中**失效的 `name` 声明**（原声明仍是旧值，与 `lib/index.js` 不一致） |

**未改动**：`lib/runtime.js`（`ctx.mcp` 服务、loader 协调与落盘）、`lib/patch.js`、
`lib/persist.js`、`lib/plan.js`、`lib/schemas.js`、`lib/config.js`、`lib/errors.js`
—— 它们用的 API 在 0.2 里逐一核对过，形状未变（见下）。

**`lib/client/` 只动了两处**（源 `lib/client/McpSettingsSection.js` 与浏览器实际加载的
打包产物 `lib/client.js` **两份同步改**）：启停改为点击即保存、加静默补刷。
其余 UI 代码未动。

---

## 三、0.2 API 核对结果（移植前逐项验过）

| 上游用法 | 0.2.0-rc.2 状态 |
| --- | --- |
| `ctx.slots.inject("settings.section", () => ctx.slots.register({name, id, order, label, locale, inject}, Component))` | ✅ 同形；6 个官方插件（`dsh-client-ui-settings-{general,account,models,…}`）仍在用 |
| `ctx.remote.$mount(contribution)` | ✅ `@deepseek-ai/dsh-api-remotes/lib/index.js:45` |
| `ctx.locale.register/bind` | ✅ `@deepseek-ai/dsh-client-locale` |
| `import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol"` | ✅ `lib/index.js:278` 仍导出两者 |
| `super(ctx, "mcp")` | ✅ 对上 `protected constructor(ctx, serviceKey, options?)` |
| `@Remote` 裸装饰器（直接调用） | ✅ 对上第一个重载 |
| `this.ctx.loader.entries()` / `entry.options.{id,name,config,group,disabled}` / `entry.subtree` / `entry.disabled` | ✅ `cordis-plugin-loader@1.0.5` 的 `Entry` / `EntryOptions` 均声明 |
| `tree.create() / update() / remove()` | ✅ `EntryTree` 同形 |
| `TypertContribution` 形状（`package/face/schemas/model.{services,events,objects}/invocations`） | ✅ 逐字段对上 `dsh-typert-registry` 的类型 |
| `import "@deepseek-ai/dsh-*"`（插件内部裸包名） | ✅ DSH 内部解析器兜底；旁证：`dsh-better-sidebar/lib/index.js:13` 直接 import 了不在 profile 里的 `@deepseek-ai/dsh-settings` 且正常运行 |

---

## 四、验证到什么程度

**已离线验证**（无需重启宿主）：

- 用 0.2 自己的 `validateTypertManifest()` 校验改后的宿主清单 → **通过**；
- **反证**：把 codec 退回旧形状 → 被精确拒绝，错误正是
  `result codec has no create() factory` —— 证明这是真根因、修复是必需的；
- 每个 codec 的 `create()` 返回可用 schema（`.parse` 存在）；
- 客户端 `TYPERT_REMOTE.package` 与包名一致、全部 codec 有工厂；
- 全部 `.js` 过 `node --check`（0 失败）；
- `package.json` 为合法 UTF-8（无 BOM）且 JSON 可解析；
- **宿主半体在真 0.2 API 上 import 通过**（`tools/verify-host.mjs`，靠 node_modules 里的
  `@deepseek-ai` junction 解析宿主包）；
- **`McpRuntime` 在真 cordis 4.0.4 `Context` 上构造成功**（`super(ctx, "mcp")` 无需活的
  gateway），且 `list()` 用假 loader 精确投影出预期的 2 条 `dsh-mcp-client` 条目：
  group 行与无关插件行被排除、`disabled` 如实映射到 `enabled`；
- **`dsh --profile web --dump-config`**（compose 配置树但不 mount）确认 bundle patch 已生效，
  树里出现 `- id: dsh-small-mcp-server / name: dsh-small-mcp-server`，与两条 `dsh-mcp-client` 并列；
- 客户端插件级 `inject` 的 3 个服务名 `slots` / `locale` / `remote` 经比对确认都在 0.2 客户端
  服务词汇表内；
- slot id `mcp` 与已装的 `dsh-mcp-servers-panel`（`mcp-servers`）不冲突；
- typert `mcp` 命名空间无冲突：已装插件里只有 `dsh-cost-meter` 也导出 `./typert`，
  但声明 `key/namespace: "mcp"` 的只有本插件；
- **隔离 profile 完整复现**：新建 `forktest`（web 模板）+ 本插件 +
  `dshmarket@1.66.6` / `dsh-better-sidebar@0.24.1` / `dsh-cost-meter@1.7.46` /
  `dsh-mcp-servers-panel@0.1.3` 同时安装，宿主侧启动干净、正常监听；
- **客户端模块被登记**：抓取隔离实例下发的页面（token→cookie 交换后 200），
  启动表里含 `…,@deepseek-ai/dsh-client-connection/client.js,dsh-small-mcp-server/client.js,…`。

> ⚠️ 上面两条**都不足以判定客户端半体可用**，本项曾据此误判为「通过」：
> 「登记在启动表」只说明模块会被下载；「宿主 stderr 干净」与客户端 fiber 的成败无关
> （那条横幅只送到页面，不打控制台）。直到浏览器实测才暴露。

**已用真实浏览器端到端验证通过**（Playwright 驱动，无头）：

- 页面加载**无** `Failed to load plugins` 横幅，启动遮罩正常撤除；
- 注入的 `console.error` / `window.error` / `unhandledrejection` 钩子**捕获 0 条异常**；
- 设置侧栏同时出现本插件的 **「MCP 服务」**（order 30）与 `dsh-mcp-servers-panel` 的
  **「MCP 服务器」**（order 82），两节互不干扰；
- 面板列出 `keyword_mcp` / `kw_spec`，含 transport、可执行文件路径，以及状态徽章；
- **启停一次点击即落盘**（本 fork 的改动）：点「停用」后**不点任何按钮**，直接核对
  DOM —— `buttons` 列表里**没有「保存」、也没有「放弃修改」**，
  且**没有**「有未保存的修改」横幅，而状态已翻成「已停用」、页脚显示「已保存并热更新」；
- **落盘**：`{profile}/cordis.patch.yml` 的 `- id: mcp-kw-spec` 行被追加 `disabled: true`；
- **热更新真的生效**：按父进程区分，沙盒实例下 `kw_spec_client.py` **消失**，
  而主宿主（真实环境）的 `kw_spec_client.py` / `keyword_mcp_server.py` **原样不受影响**；
- 反向再点「启用」同样一次生效：`disabled: true` 从 patch 层消失、子进程被重新拉起
  （宿主日志 `[kw_spec_client] 启动`）、子进程树里 `kw_spec_client.py` 回来；
- **静默补刷生效**：启用后**不做任何手工操作**（不切页、不刷新），约 4s 后徽章由
  「加载中」自动变为「运行中」——加补刷前的对照行为是必须切走再切回才会更正。

> 早先这一项曾以「草稿 + 点保存」的形式验证通过；那是上游的原始交互，
> 现已按需求改为点击即生效，故上表按新行为重测。

---

## 六、0.2.2-rc.3 适配（2026-11-16）

当前安装的 DSH core 为 `0.2.2-rc.3`（`$DSH_INSTALL_DIR/package.json` 实测）。对照
`docs/upgrade-guide/`（0.2.1-rc.1 → 0.2.2-rc.1）与安装的 `@deepseek-ai` 各包逐项核对，
本插件所用表面的兼容情况如下：

| 表面 | 0.2.2-rc.3 状态 | 处理 |
| --- | --- | --- |
| typert codec 形状（`mode:'strict'` + `typeSymbol` + **`create: () => schema`**） | ✅ `@deepseek-ai/dsh-typert-protocol` 仍要求 `create()` 工厂 | **未动**（首次移植已改） |
| `settings.section` slot 契约（`kind:'list'; scope:'root'; owner SettingsSectionOwnerProps`，注册项含 `id/order/label/locale/inject`） | ✅ `@deepseek-ai/dsh-client-ui-settings` `src/client/contract/slots.ts` 同形 | **未动** |
| `ctx.slots` / `ctx.remote` / `ctx.locale` 注入 | ✅ 当前客户端插件仍在用（`dsh-client-ui-settings-general` 等） | **未动** |
| `ctx.loader` entry-tree 变更（`EntryTree.write()` 移除、改 `commit(change)`） | ✅ 本插件**不写** `EntryTree.write()`——它直接调 `tree.create/update/remove`，落盘走自带 `persistMcpPatch()`（原子写 `cordis.patch.yml`），不受该变更影响 | **未动** |
| `@deepseek-ai/dsh-mcp-client` loader 条目（stdio / streamable-http） | ✅ `config` 的 `transport/serverName/command/args/env/cwd/url/headers/toolCallTimeoutMs/failOnStartupError` 仍在 | **未动** |
| `@deepseek-ai/dsh-typert-protocol` / `dsh-api-remotes` / `dsh-client-locale` / `cordis-plugin-loader` | ✅ 均以 `0.2.2-rc.3` / `1.1.0` 存在 | 收紧 peer 范围 |

**清理项**（`@deepseek-ai/dsh-client-ui-slots` / `dsh-client-runtime` 在 0.2.2-rc.3 已不在运行时）：

| 文件 | 改动 |
| --- | --- |
| `package.json` | `dsh.client.inject` 删除 `@deepseek-ai/dsh-client-ui-slots`；`peerDependencies` 删除 `dsh-client-ui-slots`（保留 `-ui-settings / -locale / api-remotes`）；`dsh.engines.dsh` 与 peer 范围收到 `>=0.2.1-rc.1 <0.3.0-0`（0.2.2 实测基线）；版本 `0.1.0` → `0.2.2` |
| `lib/types/client/index.d.ts` | 删除 `import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"` 与对 `@deepseek-ai/dsh-client-ui-slots` 的 `declare module` 增强——改为自包含的 `ClientContext` 接口（slots/remote/locale/effect/get） |
| `lib/types/client/McpSettingsSection.d.ts` | 删除 `import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots"`，`PanelTranslate` 改自包含函数类型 |

**结论**：这些包在浏览器上下文由 `dsh-client-modules` 提供注入（不在宿主 `node_modules`，
`require.resolve` 查不到属正常），且 `dsh.client.inject` 只是加载顺序提示、目标缺失会静默跳过；
故运行时加载不依赖它们。上述清理属于**消除指向不存在包的误导性声明**，不是修运行中断点。

### 验证状态与已知未验证项

- 已做：`node --check` 语法核对、与 0.2.2-rc.3 各 surface 的排版核对。
- **未验证**：尚未安装到 profile、未在 `0.2.2-rc.3` 上做真实浏览器端到端验证（首次移植的浏览器
  验证是在 `0.2.0-rc.2` 上做的）。安装后须重过一遍「设置面板出现 MCP 服务节 / 启停点一下即生效 /
  cordis.patch.yml 落盘」的浏览器实测（见第四节对照清单）。

---

## 五、上游的已知限制（一并继承）

- 编辑器不暴露 `reconnect` 块（启停与其他服务器编辑会保留它，但面板看不到、改不了）；
- MCP 的 resources / prompts 不在面板范围内，仍需直接改 `cordis.patch.yml`；
- **Save 是 reconcile、不是事务**：操作顺序应用，后续条目失败时前面的已经生效。
  （界面已就这一点给出明确提示，见第六节第 3 条。）
- ~~**启停会连带提交其他草稿**~~ —— **本 fork 已修掉**，见第六节第 1 条。

---

## 六、2026-11-16 重开发：修掉上游的 4 个交互缺陷

移植完成后又做了一轮实质重开发，目标是让这个 fork 与「只是能加载」区分开。四处改动都
同时落在**两份产物**上——`lib/client.js`（浏览器真正加载的打包产物）与
`lib/client/McpSettingsSection.js` / `locales.js`（可读源副本），两边保持一致。

### 1. 启停不再连带提交其他未保存草稿（P1，数据安全）

**根因**：`McpRuntime.save()` 是**整表 reconcile**——它按传入的 `servers` 数组对 loader 树
做 `remove` / `update` / `create`，host 侧无法分辨「用户只想改这一行」。而上游的
`toggleServer` 把整张 `drafts` 表发了过去：

```js
const toggleServer = (id) => {
    const next = drafts.map(...);   // ← 整张草稿表
    persist(next, true);            // ← 含所有未保存的新增/编辑
};
```

于是「点一下开关」= 「把其他所有待保存改动一并落盘」。而界面又把启停包装成「点一下立即
生效、不需要保存」，用户完全不会预期它顺手提交别的东西。

**修复**：启停只提交「**已保存的表 + 这一行翻转**」：

```js
const saved = servers.map(viewToInput);            // 已落盘状态
const flipped = { ...base, enabled: !base.enabled };
const next = saved.map((s) => s.id === id ? flipped : s);
persist(next, true);                               // 其余草稿留在本地
```

`persist` 成功后也不再 `applyList(result.value)` 整表覆盖草稿（那等于把未提交的草稿抹掉），
改为**按已提交的 id rebase**：提交过的行换成服务端返回值，没提交的行原样保留。

**已用新旧对比证明**（场景：A/B 已保存，C 是未保存新增，A 的 command 有未保存修改）：

| | 提交行数 | 含未保存的新增 C | 含 A 的未保存 command |
| --- | --- | --- | --- |
| 旧实现 | 3 | 是 | 是（`npx-CHANGED` 被写入） |
| 新实现 | 2 | 否 | 否（仍为已保存的 `npx`） |

### 2. `pending` / `loading` / `unloading` 三个阶段不再折叠成一个文案（P1，可观测性）

`phaseBadge` 原本把三者一起 `return t("status.loading")`，于是 `status.pending` 与
`status.unloading` 两个字典键是死键。而这三态恰恰是用户最需要区分的：刚点完开关
（`pending`）、正在启动（`loading`）、正在卸载（`unloading`）。现在各自返回自己的文案。

### 3. 热更新窗口有反馈、部分失败说清楚（P1，反馈）

- `persist` 一进入就把 footer 提示设为「正在应用改动，受影响的服务器会热重启，通常 1–4 秒」
  （`footer.savingHint`）。原先只是把按钮置灰，1–4 秒的重启窗口看起来像卡死。
- `save` 失败时文案补上「改动是按条目逐个应用的，失败前的条目可能已经生效」——
  原先只报「保存失败」，用户会以为什么都没变。

### 4. 编辑未保存的新增行不再丢内容（P2，数据丢失）

行内的「编辑」按钮原本用 `toEditorDraft(view)`，而 `view` 来自**已保存**列表。一个新增但
还没保存的行 `view === undefined`，于是 `toEditorDraft(undefined)` 返回**空白的「新增服务」
表单**——用户点「编辑」等于把自己刚输入的内容清空。

**修复**：新增 `inputToEditorDraft(input)`，直接从**草稿行**构造编辑器内容；行内编辑改用
它，因此未保存的行也能原样打开。

### 附：新增的「未保存」徽章与脏判定

行徽章原先对 `view === undefined` 的行显示**空徽章**。现在加了 `isDraftDirty()`（用
键序无关的 `stableKey` 做结构化比较），与磁盘不一致的行显示「未保存」；没有 view 的新增行
也算脏。这样「界面说你没保存」和「`save` 实际会写什么」是同一套判据。

### 本轮验证

- `node --check`：`lib/` 下 16 个 js 全通过；
- 辅助函数行为验证 14 项全 PASS（`stableKey` 键序无关、`isDraftDirty` 四种输入、
  `inputToEditorDraft` 8 个字段保留）；
- 启停新旧对比 11 项全 PASS（含「对未保存新增行点开关」「未知 id 不抛异常」两个边界）；
- locale 键集：zh/en 各 53 键，无单边键，占位符一致，bundle 内嵌副本已同步；
- `tools/verify-host.mjs`（真 cordis + 真 typert 校验器 + 真 McpRuntime）全部 PASS；
- **仍未验证**：`0.2.2-rc.3` 上的真实浏览器端到端点击（需重启 DSH 后人工过一遍）。
