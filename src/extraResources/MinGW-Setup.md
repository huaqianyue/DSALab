# MinGW 安装指南

## 📁 MinGW 放置位置

要打包带有MinGW的DSALab压缩包版本，您需要将MinGW安装文件放置在以下目录：

```
src/extraResources/mingw64/
```

## 📦 目录结构

完整的MinGW目录结构应该如下：

```
src/extraResources/
├── mingw64/
│   ├── bin/
│   │   ├── g++.exe
│   │   ├── gcc.exe
│   │   ├── gdb.exe
│   │   └── ... (其他编译器工具)
│   ├── include/
│   │   └── ... (头文件)
│   ├── lib/
│   │   └── ... (库文件)
│   └── ... (其他MinGW目录)
├── bin/
├── themes/
└── ... (其他资源文件)
```

## 🔨 构建命令

### 1. 完整版安装包 (NSIS)
```bash
npm run build
```
- **输出**: `release/DSALab Setup 7.2109.1.exe`
- **包含**: 应用 + MinGW + 安装器

### 2. 精简版压缩包 (无MinGW)
```bash
npm run build:no-mingw
```
- **输出**: `release/DSALab-7.2109.1-no-mingw.7z`
- **包含**: 仅应用程序

### 3. 带MinGW的压缩包 (新增)
```bash
npm run build:zip-mingw
```
- **输出**: `release/DSALab-7.2109.1-with-mingw.7z`
- **包含**: 应用 + MinGW (免安装压缩包)

## 💡 MinGW 获取方式

### 方法1: 从现有Dev-C++安装提取
如果您已经安装了其他版本的Dev-C++：
1. 找到Dev-C++安装目录下的MinGW64文件夹
2. 复制整个MinGW64文件夹到 `src/extraResources/mingw64/`

### 方法2: 下载官方MinGW-w64
1. 访问 [MinGW-w64官网](https://www.mingw-w64.org/)
2. 下载适合的版本（推荐64位）
3. 解压到 `src/extraResources/mingw64/`

### 方法3: 使用MSYS2安装
1. 安装MSYS2
2. 安装MinGW-w64工具链: `pacman -S mingw-w64-x86_64-toolchain`
3. 从MSYS2目录复制mingw64文件夹

## ⚠️ 注意事项

1. **文件夹名称**: 必须命名为 `mingw64`（不是MinGW64或其他变体）
2. **路径深度**: MinGW工具必须在 `mingw64/bin/` 下才能被正确识别
3. **文件大小**: MinGW完整包可能有几百MB，会显著增加压缩包大小
4. **许可证**: 确保遵守MinGW的使用许可证

## 🧪 测试MinGW安装

添加MinGW后，可以测试是否正确：
1. 构建应用: `npm run electron:prod`
2. 在设置中选择"使用自带的MinGW"
3. 编写简单的C++程序进行编译测试

## 📊 文件大小对比

| 版本 | 大小 | 说明 |
|------|------|------|
| 精简版 | ~50-100MB | 无编译器，需要用户自配置 |
| 带MinGW压缩包 | ~300-500MB | 完整开发环境，解压即用 |
| 安装包版 | ~300-500MB | 完整开发环境，安装器版本 |
