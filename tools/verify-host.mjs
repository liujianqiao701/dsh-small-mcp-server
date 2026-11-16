/**
 * 宿主半体离线验证：在真 0.2 API 上 import 插件、构造 `McpRuntime`、并调用 `list()`。
 *
 * 需要 `<插件>/node_modules/@deepseek-ai` 指向 DSH 安装树的 junction（见本文件顶部说明），
 * 这样插件内部的裸包名 import 才能解析。仅开发用，`files` 白名单不含 `tools/`，不会发布。
 *
 * 跑法：cd <插件目录> && node tools/verify-host.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { TYPERT } from '../lib/typert.js'
import { name, inject, apply } from '../lib/index.js'
import { McpRuntime } from '../lib/runtime.js'

let fail = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { fail++; console.log('  FAIL  ' + m) }

console.log('=== 1) 宿主半体 import 解析（真 0.2 树） ===')
ok(`lib/index.js 导入成功 name=${name} inject=${JSON.stringify(inject)} apply=${typeof apply}`)

console.log('\n=== 2) TYPERT 清单过 0.2 校验器 ===')
try {
  const v = validateTypertManifest('dsh-small-mcp-server', TYPERT)
  ok(`validateTypertManifest 通过；services=${v.model.services.map((s) => s.key)}`)
} catch (e) { bad('清单校验抛错: ' + e.message) }

console.log('\n=== 3) 用真 Context + 假 loader 构造 McpRuntime 并调用 list() ===')
const fakeEntries = [
  {
    options: {
      id: 'mcp-keyword', name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: 'keyword_mcp', transport: 'stdio', command: 'python.exe', args: ['a.py'], env: { K: 'v' } },
    },
    disabled: false,
  },
  {
    options: {
      id: 'mcp-kw-spec', name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: 'kw_spec', transport: 'stdio', command: 'python.exe' },
    },
    disabled: true,
  },
  { options: { id: 'unrelated', name: 'some-other-plugin', config: {} }, disabled: false },
  { options: { id: 'grp', name: '@deepseek-ai/dsh-mcp-client', group: true, config: {} }, disabled: false },
]

const ctx = new Context()
try {
  ctx.provide('loader')
  ctx.set('loader', { entries: () => fakeEntries })
  ok('Context 建立、loader 服务注入成功（cordis 4.0.4）')
} catch (e) {
  bad('注入 loader 失败: ' + e.message)
}

try {
  const rt = new McpRuntime(ctx)
  ok('McpRuntime 构造成功（TypertRemoteService super(ctx,"mcp") 通过）')
  const rows = rt.list()
  ok(`list() 返回 ${rows.length} 行`)
  for (const r of rows) {
    console.log(`         serverName=${r.serverName}  enabled=${r.enabled}  transport=${r.transport}  id=${r.id}`)
  }
  if (rows.length === 2) ok('正确投影出 2 个 mcp-client 条目（group 行与无关行被排除）')
  else bad(`预期 2 行，实得 ${rows.length} 行`)
  const kw = rows.find((r) => r.serverName === 'keyword_mcp')
  if (kw && kw.enabled === true) ok('keyword_mcp enabled=true')
  else bad('keyword_mcp 的 enabled 不对')
  const spec = rows.find((r) => r.serverName === 'kw_spec')
  if (spec && spec.enabled === false) ok('kw_spec enabled=false（disabled 透传）')
  else bad('kw_spec 的 disabled 未透传')
} catch (e) {
  bad('构造/调用失败: ' + e.message)
  console.log('        （若为缺少 typert gateway，属预期——那需要真宿主）')
}

console.log(fail === 0 ? '\n结果：全部通过 ✅' : `\n结果：${fail} 项失败 ❌`)
process.exit(fail === 0 ? 0 : 1)
