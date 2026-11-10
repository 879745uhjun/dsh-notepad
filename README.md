# DSH 记事本插件

`DSH`（DeepSeek Harness）Web 界面右侧的常驻记事本。点右侧 40px 竖条，抽屉从窗口右边缘滑出，悬浮在界面之上——不挤开内容，也不占用内置侧栏和内置右侧面板。

![界面示意图](design-schematic.png)

> 上图为设计示意图，实际配色与字号以运行中的 DSH 主题为准。

## 功能

- **抽屉式停靠**：收起时只剩 40px 竖条（竖排「记事本」正立显示），展开时向左滑出，只有 `transform` 动画，不触发界面重排。
- **宽度可调**：拖动面板左边缘调整，260–560px，上限随窗口宽度自适应。
- **图片**：三个入口——标题栏图片按钮、直接拖拽进面板、`Ctrl+V` 粘贴截图。超过 1600px 或 900KB 的图片自动缩放到 1600px 内并转 WebP。
- **图片查看**：缩略图网格，点开大图预览，`Esc` 或点背景关闭；缩略图右上角小叉删除。
- **自动保存**：文字 250ms 防抖存 `localStorage`，图片 Blob 存 `IndexedDB`（不占 `localStorage` 配额）；底部显示保存状态、字数与图片数。
- **与界面共存**：抽屉是悬浮层，内置侧栏从不被覆盖；展开时只盖住对话区右侧一条（默认 300px），按 `Esc` 或点竖条立即收起，三者始终可见。
- **让位内置右栏**：拖动抽屉**右边缘**可让整个记事本向左平移（偏移量随宽度一起持久化）。把内置右侧栏整块让出来后，「会话窗口 + 内置右栏 + 记事本」三者并排、互不遮挡。
- **跟随主题**：颜色全部取自 `--dsw-alias-*` 主题变量；文案走 Client locale 服务，中英双语。

## 安装

在已安装 DSH 的 profile 中用插件管理器安装本目录：

```
plugin_manager install_bundle  target: <本仓库路径>  enabled: true
```

插件会写入 profile 的 `node_modules` 并注册到 `dsh.profile.bundles`。装好后刷新 Web 页面即可看到右侧竖条。

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包清单；`dsh.bundle.patch` 指向 `cordis.patch.yml`，`dsh.client` 声明 Web 端注入 |
| `cordis.patch.yml` | 向 profile 组合插入一行 `dsh-notepad` |
| `index.js` | host 半边，空实现（插件只需客户端渲染） |
| `client.js` | 客户端全部逻辑：`shell.overlay` 槽注册、抽屉、图片、持久化、样式、locale |
| `locale/zh.json`、`locale/en.json` | Plugin Manager / 设置页读取的插件名称与描述 |
| `icon.svg` | 插件图标 |
| `design-schematic.png` | 本文档顶部的界面示意图 |

## 实现要点

- 界面挂载在 **`shell.overlay`** 悬浮层：这是整个框架唯一能把内容贴到窗口右边缘、且不覆盖任何内置槽位的挂载点。插件不注册进 `rightbar`、`sidebar.right.pane.tab` 等内置区域，因此不会和内置侧栏/右侧面板争位置。
- 收起/展开通过整体 `translateX` 位移实现：容器宽度固定，收起时正文被移出窗口外由框架裁掉，只剩最右侧的竖条。
- 竖排文字用 CSS 标准写法 `writing-mode: vertical-rl` + `text-orientation: mixed`，不加任何旋转——拉丁字母按常规竖排旋转，中文保持正立、自上而下。
- 不引入任何 `@deepseek-ai/dsh-client-*` 包，React 由浏览器模块表提供，避免和宿主重复加载。

## 已知限制

- 抽屉是悬浮层，内置右侧面板展开时两者会重叠；把记事本收起为竖条即可避开。
- 图片按 Blob 存 IndexedDB，属于浏览器本地数据，不随 DSH profile 迁移。
