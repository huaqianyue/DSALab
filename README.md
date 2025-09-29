# DSALab

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/Guyutongxue/DSALab/Yarn%20CI)
![LGTM Grade](https://img.shields.io/lgtm/grade/javascript/github/Guyutongxue/DSALab?label=code%20quality)

<p align="center">
<img src="./src/assets/icons/favicon.png" height="70" alt="DSALab"> =
<img src="https://s3.ax1x.com/2021/01/22/sombEd.png" height="70" alt="Angular">+
<img src="https://s3.ax1x.com/2021/01/22/somL4I.png" height="70" alt="Electron">+
<img src="https://s3.ax1x.com/2021/01/22/som7HH.png" height="70" alt="Monaco Editor">+
<img src="https://s3.ax1x.com/2021/01/22/somqUA.png" height="70" alt="MinGW-w64">
</p>

## 简介

DSALab 是一个面向数据结构与算法学习的综合性 C++ 开发环境，基于 Angular、Electron、Monaco Editor 和 MinGW-w64 构建。它不仅提供了完整的 C++ 编程功能，还集成了题目管理、音频录制、自动测试等专为编程学习设计的特色功能。

**此项目与 Bloodshed 的 Dev-C++ 无关联。**

![Snapshot](https://s3.ax1x.com/2021/02/22/yHDron.png)

## 核心功能

### 🎯 题目导入与管理
- **灵活的题目导入**：支持从 JSON 文件导入算法题目，自动合并本地和远程题库
- **智能题目列表**：提供可视化的题目列表，支持快速切换和状态显示
- **本地存储**：自动保存题目到本地，支持离线使用
- **题目过滤**：自动跳过无效题目，确保导入质量

### 📖 题目描述与导航
- **富文本显示**：支持 Markdown 格式的题目描述，包括代码高亮和格式化
- **智能解析**：自动处理函数签名、测试示例等特殊内容
- **便捷导航**：提供上一题/下一题快速切换功能
- **实时更新**：题目内容与编辑器状态实时同步

### 🎙️ 音频录制与讲解
- **高质量录制**：使用 WebRTC 技术进行音频录制，支持 WebM 格式
- **录制控制**：提供开始、暂停、继续、停止等完整录制控制
- **实时回放**：集成 Howler.js 音频播放器，支持进度控制和快速定位
- **自动保存**：录制完成后自动保存到题目工作区
- **时间显示**：实时显示录制时间和播放进度

### ⚡ 编译运行系统
- **智能编译**：基于 MinGW-w64 的 C++ 编译器，支持 C++20 标准
- **快速运行**：一键编译运行，集成控制台输出显示
- **错误诊断**：提供详细的编译错误信息和语法检查
- **DSALab 模式**：特别优化的题目编译流程，自动保存和同步代码

### 🐛 调试功能
- **可视化调试**：集成 GDB 调试器，提供图形化调试界面
- **断点管理**：支持设置、删除断点，可视化断点状态
- **变量监控**：实时查看局部变量和调用栈
- **步进执行**：支持单步执行、步入、步出等调试操作
- **表达式求值**：在调试过程中实时计算表达式值

### 🧪 自动测试与评分
- **智能测试**：自动提取学生函数代码，与预定义测试模板结合
- **实时评分**：运行测试用例并给出通过率和分数
- **结果保存**：测试结果自动保存，支持历史查看
- **状态显示**：在题目列表中显示测试状态（通过/失败/未测试）
- **详细报告**：提供测试详情和错误信息

### 📤 数据导出
- **工作成果导出**：将完成的题目（代码+音频）打包为 ZIP 文件
- **智能文件名**：自动生成包含测试分数的文件名
- **选择性导出**：可选择特定题目进行导出
- **完整性检查**：只导出同时包含代码和音频的完整题目
- **历史记录**：同时导出学习历史和测试结果

### ⚙️ 编译器设置
- **灵活配置**：支持编译标准、优化级别、调试信息等多项设置
- **环境管理**：可配置 MinGW 路径，支持本地和打包版本切换
- **编码设置**：支持输入输出编码配置，解决中文显示问题
- **警告控制**：可配置编译警告级别和错误处理策略
- **实时生效**：设置保存后立即生效，无需重启应用

## 技术特色

- **现代化界面**：基于 Angular 和 Ant Design 的现代化 UI
- **跨平台支持**：Electron 架构，支持 Windows 平台
- **专业编辑器**：集成 Monaco Editor，提供 VS Code 级别的编辑体验
- **完整工具链**：内置 MinGW-w64 编译器，开箱即用
- **学习导向**：专为编程学习设计的功能集合

## ⚠️ 使用说明

**本项目专为数据结构与算法学习设计，不是传统 Dev-C++ 的替代品。** 如果您需要传统 Dev-C++ 的新版本，请访问 [royqh1979/Dev-CPP](https://github.com/royqh1979/Dev-CPP)。作为一个基于现代 Web 技术的桌面应用，本项目具有以下特点：

- **仅支持 64 位系统**：不支持 32 位系统
- **Windows 10+ 要求**：仅在 Windows 10 及更高版本测试
- **专注 C++ 单文件**：主要支持 C++ 算法题目，对 C 项目支持有限
- **简体中文界面**：当前仅支持简体中文界面
- **较大的安装包**：由于集成了 Electron 和 MinGW 等组件，安装包相对较大

## 构建说明

本项目基于 [angular-electron](https://github.com/maximegris/angular-electron) 模板构建。

### 安装依赖

在 Windows 上安装 Node.js 和 npm。您需要安装 node-gyp（包括 Python 和 MSVC）来构建某些模块。

然后在项目根目录运行：
```bash
npm install
npm run electron:rebuild # 重新构建 node 模块以匹配 electron 版本
```

### 处理额外资源

请参考 [额外资源说明](src/extraResources/README.md)。

### 可用命令

| 命令                     | 描述                                    |
| ----------------------- | --------------------------------------- |
| `npm start`             | 在浏览器中热重载，用于调试 UI            |
| `npm run electron:dev`  | 在 Electron 中运行开发环境              |
| `npm run build`         | 使用 electron-builder 构建可执行文件    |
| `npm run build:mingw-zip` | 构建包含 MinGW 的 ZIP 安装包           |

### 版本信息

- **当前版本**：1.0.0
- **基于框架**：Angular + Electron
- **编译器**：MinGW-w64
- **编辑器**：Monaco Editor
