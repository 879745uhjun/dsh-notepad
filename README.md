# DSH 记事本插件

`DSH`（DeepSeek Harness）Web 界面**底部**的常驻记事本。它挂在框架真实布局的底栏（`shell.bottom`）里，高度自己说了算——上面那三栏（左侧栏、会话/主面板、内置右栏）会相应变矮，所以**永远不遮挡任何内容**。

![界面示意图](design-schematic.png)

> 上图为设计示意图，实际配色与字号以运行中的 DSH 主题为准。

## 功能

- **底部停靠、真正占位**：注册进 `shell.bottom`，是布局里的第五块区域，不是浮层；切换主面板（会话 ↔ 开始 ↔ 插件页）时它一直挂在那儿。
- **高度可调**：拖动顶边 6px 热区调整高度（120–720px，最大 70% 窗口高）；点标题行整行收起成 38px 细条，再点展开。
- **图片**：三个入口——标题栏图片按钮、直接拖进底栏、`Ctrl+V` 粘贴截图。超过 1600px 或 900KB 的自动缩放到 1600px 内并转 WebP。
- **图片查看**：右侧缩略图栏，点开全屏大图预览，`Esc` 或点背景关闭；缩略图右上角小叉删除。
- **自动保存**：文字 250ms 防抖存 `localStorage`，图片 Blob 存 `IndexedDB`（不占 `localStorage` 配额）；标题行实时显示「已保存 / 保存中」、字数与图片数。
- **跟随主题**：颜色全部取自 `--dsw-alias-*` 主题变量，与内置栏同底色（`bg-base`）、同款发丝分隔线；文案走 Client locale 服务，中英双语。

## 安装

在已安装 DSH 的 profile 中用插件管理器安装本目录：

```
plugin_manager install_bundle  target: <本仓库路径>  enabled: true
```

插件会写入 profile 的 `node_modules` 并注册到 `dsh.profile.bundles`。装好后刷新 Web 页面即可看到底部细条。

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包清单；`dsh.bundle.patch` 指向 `cordis.patch.yml`，`dsh.client` 声明 Web 端注入 |
| `cordis.patch.yml` | 向 profile 组合插入一行 `dsh-notepad` |
| `index.js` | host 半边，空实现（插件只需客户端渲染） |
| `client.js` | 客户端全部逻辑：`shell.bottom` 槽注册、底栏、图片、持久化、样式、locale |
| `locale/zh.json`、`locale/en.json` | Plugin Manager / 设置页读取的插件名称与描述 |
| `icon.svg` | 插件图标 |
| `design-schematic.png` | 本文档顶部的界面示意图 |

## 实现要点

- 挂载点是 **`shell.bottom`**：框架在左中右三栏下方留的一行真实布局，槽说明写明「它的高度会减少上方各列的可用高度；空内容不占位」。注册即占位，无遮挡问题。
- 高度由插件自己持有（inline `height`），并由底栏的 `grid-template-rows: minmax(0,1fr) auto` 自动回流到上方各列。
- 收起态只渲染 38px 标题行，不挂载正文；展开态才挂载输入框与图片栏。
- 大图预览用 `position: fixed` 覆盖视口，避免被底栏的 `overflow` 裁掉。
- 不引入任何 `@deepseek-ai/dsh-client-*` 包，React 由浏览器模块表提供，避免和宿主重复加载。

## 已知限制

- 底栏是单占位槽（`shell.bottom`）；若将来官方也往里注册内容，两者会互相顶替（后注册者优先）。
- 图片按 Blob 存 IndexedDB，属于浏览器本地数据，不随 DSH profile 迁移。
- 文字与图片不区分会话：是整个 DSH 共用的一份便签。
