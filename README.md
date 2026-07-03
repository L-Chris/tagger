# Dominator 🔍

> **面向知乎内容场景的浏览器扩展，用于辅助识别异常推广、操纵性表达和疑似营销账号风险**
> **由 Qwen3.7-Max 驱动开发，从产品迭代、架构设计到代码实现均由 AI 辅助完成**

[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-purple)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 📝 项目简介

这是一个 Chrome/Edge 浏览器扩展，通过分析知乎用户的文章和回答内容，自动识别可能存在的水军、营销号、刷单账号等可疑行为。

### 命名寓意

**Dominator** 取自《心理测量者》（PSYCHO-PASS）中的同名装置。原作里的 Dominator 会读取目标的心理状态并给出风险判断；本项目借用这个意象，用于表达“对公开内容进行多维度风险测量”的产品定位。

这里的 Dominator 不是裁决工具，而是一个辅助观察工具：它只基于公开文章和回答生成风险分数、维度标签和分析报告，帮助用户更快发现异常模式，最终判断仍应由使用者结合上下文完成。

### ✨ 核心功能

- **🤖 AI 驱动分析**：基于 LLM 大模型的智能行为分析
- **📊 多维度评估**：7大维度（主题集中度、内容重复度、商业植入、情绪操控、时间异常、互动异常、账号异常）综合评分
- **🌊 流式输出**：实时显示分析过程，支持流式渲染
- **🔒 隐私优先**：所有 LLM 调用都在浏览器端完成，API Key 本地加密存储
- **⚡ 高性能**：Manifest V3 + TypeScript 构建，启动快速
- **🎨 现代化 UI**：基于 React 19 + Vite 8 开发

## 🎯 分析维度

| 维度 | 权重 | 判断标准 |
|------|------|----------|
| 主题集中度 | 20% | 长期围绕同一品牌/公司/人物 |
| 内容重复度 | 20% | 模板化、复用句式 |
| 商业植入 | 15% | 频繁引导购买/注册/私信 |
| 情绪操控 | 15% | 夸大、攻击、带节奏 |
| 时间异常 | 10% | 短时间高频发布 |
| 互动异常 | 10% | 固定账号互响应 |
| 账号异常 | 10% | 新号/资料空/领域跳变 |

## 🚀 快速开始

### 安装

1. 前往 [Releases](https://github.com/L-Chris/dominator/releases) 下载最新版本的 `dominator.zip`
2. 解压到本地任意目录（例如：`~/extensions/dominator`）
3. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/`
4. 开启右上角的 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择解压后的文件夹
6. 点击浏览器工具栏中的扩展图标，打开弹窗配置你的 LLM API：
   - API URL（例如：`https://api.openai.com/v1/chat/completions`）
   - API Key
   - 模型名称（例如：`gpt-4`）

### 使用

1. 访问任意知乎用户主页
2. 点击页面上的 **分析** 按钮
3. 等待 AI 分析完成（通常 10-30 秒）
4. 查看分析报告和风险评估

## 🛠️ 开发

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

开发时在 Chrome/Edge 的 `chrome://extensions/` 中开启开发者模式，点击“加载已解压的扩展程序”，选择项目里的 `dist-dev/` 目录。保持 `npm run dev` 运行后，修改源码会自动重新构建并通知已打开的知乎页面刷新；修改 background 入口时扩展也会自动重载。

Chrome 扩展不能像普通 Web 应用一样做到完整 HMR，当前开发模式采用的是 watch build + 扩展/页面自动重载，适合快速验证 content script、popup 和 background 改动。

### 构建

```bash
npm run build
```

构建产物在 `dist/` 目录，同时生成 `dist/dominator.zip`。开发包输出到 `dist-dev/`，两者分开避免 watch 构建影响发布包。

### 类型检查

```bash
npm run typecheck
```

## 🏗️ 技术栈

- **前端框架**：React 19 + TypeScript 6
- **构建工具**：Vite 8 + Rollup
- **Markdown 渲染**：marked + DOMPurify
- **浏览器 API**：Chrome Extension Manifest V3
- **LLM 接口**：OpenAI API 兼容格式
- **开发工具**：Qwen3.7-Max（AI 辅助开发）

## 📂 项目结构

```
dominator/
├── src/
│   ├── api/              # API 封装（知乎、LLM、存储）
│   ├── background/       # Service Worker
│   ├── components/       # React 组件
│   ├── content/          # Content Script
│   ├── hooks/            # 自定义 Hooks
│   ├── popup/            # 弹窗配置页
│   └── types/            # TypeScript 类型定义
├── public/               # 静态资源
├── vite.config.ts        # Vite 配置
├── manifest.json         # 扩展清单
└── package.json
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- **Qwen3.7-Max**：整个项目由通义千问 Qwen3.7-Max 模型驱动开发，从架构设计到代码实现均由 AI 辅助完成
- **React Team**：提供优秀的 UI 框架
- **Vite Team**：极速的开发体验
- **知乎用户社区**：提供真实的测试场景

---

**⚠️ 免责声明**：本工具仅供参考，分析结果不代表最终结论。请理性看待内容创作者，避免误判。
