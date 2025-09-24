好的，这是每个模块的详细信息，包括其目的、关键内容、依赖项、导出的功能以及它处理的 IPC 通道。

---

### `src/types.ts` (现有文件)

*   **目的 (Purpose):** 作为整个应用程序（主进程和渲染进程）的共享类型定义中心。它定义了数据结构，确保了跨进程通信和组件之间的数据一致性。
*   **关键内容 (Key Contents):**
    *   `HistoryEventBase`, `SimplifiedContentChange`, `CodeEditEvent`, `ProgramRunStartEvent`, `ProgramOutputEvent`, `ProgramRunEndEvent`, `ProblemLifecycleEvent`, `AudioEvent`, `HistoryEvent`: 定义了各种历史记录事件的结构。
    *   `Window.electron` 接口: 为渲染进程的 `window.electron` 对象定义了所有 IPC 通道的方法签名，是渲染进程与主进程通信的桥梁。
    *   `ThemeDefinition`: 定义了主题的结构。
    *   `Problem`: 定义了编程题目的数据结构。
    *   `ProblemWorkspaceData`: 定义了每个问题工作区在渲染进程中的状态。
    *   `AppSettings`: 定义了应用程序的用户设置结构。
    *   `Translations`, `Language`, `AppTranslations`: 定义了国际化相关的类型。
*   **依赖项 (Dependencies):** 无（它被其他文件依赖）。
*   **导出的功能 (Exports):** 所有定义的接口和类型。
*   **IPC 通道 (IPC Channels):** 定义了 `Window.electron` 接口中所有 IPC 通道的方法签名，但本身不处理 IPC 逻辑。

---

### `src/utils/globals.ts` (新增)

*   **目的 (Purpose):** 集中管理主 Electron 进程内部的全局、可变状态。这有助于避免将这些关键的共享变量分散到多个文件中，或强制将它们全部放在 `main.ts` 中。
*   **关键内容 (Key Contents):**
    *   `cppProcess`: `ChildProcessWithoutNullStreams | null` 类型，用于跟踪当前正在运行的 C++ 子进程实例。
    *   `setCppProcess(process: ChildProcessWithoutNullStreams | null)`: 一个函数，用于安全地设置 `cppProcess` 的值。
    *   `historyBuffers`: `Map<string, { batchBuffer: HistoryEvent[]; runEventsBuffer: HistoryEvent[]; batchTimer: NodeJS.Timeout | null; }>` 类型，存储每个 `problemId` 的历史事件缓冲区。
    *   `HISTORY_FLUSH_BATCH_INTERVAL_MS`: `number` 类型，定义历史事件批量写入磁盘的时间间隔。
*   **依赖项 (Dependencies):**
    *   `node:child_process` (用于 `ChildProcessWithoutNullStreams` 类型)。
    *   `../types` (用于 `HistoryEvent` 类型)。
*   **导出的功能 (Exports):** `cppProcess`, `setCppProcess`, `historyBuffers`, `HISTORY_FLUSH_BATCH_INTERVAL_MS`。
*   **IPC 通道 (IPC Channels):** 无（它只提供数据和状态）。

---

### `src/utils/paths.ts`

*   **目的 (Purpose):** 集中管理应用程序在文件系统中使用的各种标准化路径，确保路径定义的一致性，并简化其他模块对这些路径的访问。
*   **关键内容 (Key Contents):**
    *   `initPaths()`: 在 Electron `app` 对象就绪后，初始化 `USER_DATA_PATH` 和 `DOCUMENTS_PATH` 的函数。
    *   `getLocalProblemsJsonPath()`: 获取本地 `problems.json` 文件的完整路径。
    *   `getUserWorkspacesRoot()`: 获取用户工作区根目录的完整路径。
    *   `getAppSettingsPath()`: 获取应用程序设置文件的完整路径。
    *   `getTempCppDir()`: 获取 C++ 编译和运行临时目录的完整路径。
    *   `CDN_PROBLEMS_URL`: CDN 上原始 `problem.json` 文件的 URL。
*   **依赖项 (Dependencies):**
    *   `electron` (`app`)。
    *   `node:path`。
*   **导出的功能 (Exports):** `initPaths`, `getLocalProblemsJsonPath`, `getUserWorkspacesRoot`, `getAppSettingsPath`, `getTempCppDir`, `CDN_PROBLEMS_URL`。
*   **IPC 通道 (IPC Channels):** 无。

---

### `src/utils/appLifecycle.ts`

*   **目的 (Purpose):** 处理 Electron 应用程序的核心生命周期事件，包括主窗口的创建、应用程序的激活以及在应用程序退出时的优雅处理（例如，确保历史记录被保存）。
*   **关键内容 (Key Contents):**
    *   `createWindow()`: 创建并配置主 `BrowserWindow` 实例。
    *   `setupAppLifecycleHandlers()`: 注册 Electron 应用程序的各种事件监听器 (`window-all-closed`, `activate`, `before-quit`)。
*   **依赖项 (Dependencies):**
    *   `electron` (`app`, `BrowserWindow`, `Menu`, `ipcMain`)。
    *   `node:path`。
    *   `./historyManager` (用于 `flushAllHistoryBuffers`)。
*   **导出的功能 (Exports):** `createWindow`, `setupAppLifecycleHandlers`。
*   **IPC 通道 (IPC Channels):**
    *   **监听 (Listens):** `app.on('window-all-closed')`, `app.on('activate')`, `app.on('before-quit')` (Electron 内部事件)。
    *   **监听 (Listens):** `ipcMain.once('app-quit-acknowledged')` (来自渲染进程的确认)。
    *   **发送 (Sends):** `mainWindow.webContents.send('app-before-quit')` (通知渲染进程准备退出)。

---

### `src/utils/historyManager.ts`

*   **目的 (Purpose):** 管理用户在应用程序中的所有操作和程序执行的历史记录。它负责将事件缓冲、定时或即时地写入到问题专属的 `history.json` 文件中。
*   **关键内容 (Key Contents):**
    *   `flushBuffer(problemId, bufferType)`: 将指定问题的特定缓冲区（批量或运行）中的事件写入磁盘。
    *   `flushAllHistoryBuffers()`: 强制将所有问题的历史事件缓冲区写入磁盘（主要在应用退出时调用）。
    *   `setupHistoryManager(ipcMain)`: 注册 IPC 监听器来接收和处理历史事件。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`)。
    *   `node:fs` (`promises`)。
    *   `node:path`。
    *   `../types` (导入 `HistoryEvent` 及相关类型)。
    *   `./paths` (导入 `getUserWorkspacesRoot`)。
    *   `./globals` (导入 `historyBuffers` 和 `HISTORY_FLUSH_BATCH_INTERVAL_MS`)。
*   **导出的功能 (Exports):** `flushBuffer`, `flushAllHistoryBuffers`, `setupHistoryManager`。
*   **IPC 通道 (IPC Channels):**
    *   **监听 (Listens):** `ipcMain.on('record-history-event')` (接收来自渲染进程或其他主进程模块的历史事件)。

---

### `src/utils/cppExecution.ts`

*   **目的 (Purpose):** 负责 C++ 代码的编译、执行和与 C++ 程序进行交互。它处理程序的输入/输出、超时管理以及向渲染进程报告执行状态。
*   **关键内容 (Key Contents):**
    *   `setupCppExecutionHandlers(ipcMain)`: 注册 IPC 处理器来处理 C++ 代码的编译和运行请求，以及用户输入。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`, `app`, `dialog`)。
    *   `node:child_process` (`exec`, `spawn`)。
    *   `node:fs` (`promises`)。
    *   `node:path`。
    *   `node:buffer` (`Buffer`)。
    *   `../types` (导入 `ProgramRunStartEvent`, `ProgramRunEndEvent`, `ProgramOutputEvent`)。
    *   `./globals` (导入 `cppProcess`, `setCppProcess`)。
    *   `./paths` (导入 `getTempCppDir`)。
*   **导出的功能 (Exports):** `setupCppExecutionHandlers`。
*   **IPC 通道 (IPC Channels):**
    *   **处理 (Handles):** `ipcMain.handle('compile-and-run-cpp')` (接收编译和运行 C++ 代码的请求)。
    *   **监听 (Listens):** `ipcMain.on('send-user-input')` (接收用户输入并发送给运行中的 C++ 程序)。
    *   **发送 (Sends):** `event.sender.send('cpp-output-chunk')` (向渲染进程发送 C++ 程序的输出、错误或状态信息)。
    *   **发出 (Emits):** `ipcMain.emit('record-history-event')` (向 `historyManager` 发送程序运行相关的历史事件)。

---

### `src/utils/fileDialogs.ts`

*   **目的 (Purpose):** 提供 Electron `dialog` 和 `shell` 模块的封装，允许渲染进程安全地触发文件打开/保存对话框，以及在默认浏览器中打开外部链接。
*   **关键内容 (Key Contents):**
    *   `setupFileDialogHandlers(ipcMain)`: 注册 IPC 处理器来处理文件对话框和外部链接请求。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`, `dialog`, `shell`, `BrowserWindow`)。
    *   `node:fs` (`promises`)。
*   **导出的功能 (Exports):** `setupFileDialogHandlers`。
*   **IPC 通道 (IPC Channels):**
    *   **处理 (Handles):** `ipcMain.handle('open-external')` (在默认浏览器中打开 URL)。
    *   **处理 (Handles):** `ipcMain.handle('show-open-dialog')` (显示文件打开对话框)。
    *   **处理 (Handles):** `ipcMain.handle('show-save-dialog')` (显示文件保存对话框)。

---

### `src/utils/problemManager.ts`

*   **目的 (Purpose):** 管理应用程序中所有编程题目的列表。这包括从本地文件加载、从 CDN 同步最新题目、合并本地修改和 CDN 更新、处理题目导入以及将题目列表保存到本地。
*   **关键内容 (Key Contents):**
    *   `loadPureLocalProblems()`: 纯粹从本地 `problems.json` 文件读取题目列表。
    *   `setupProblemManager(ipcMain)`: 注册 IPC 处理器来处理题目列表的各种操作。
    *   `RawProblem` (内部接口): 用于解析原始的、可能不完全符合 `Problem` 接口的 JSON 数据。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`, `dialog`)。
    *   `node:fs` (`promises`)。
    *   `node:path`。
    *   `../types` (导入 `Problem` 类型)。
    *   `./paths` (导入 `getLocalProblemsJsonPath`, `getUserWorkspacesRoot`, `CDN_PROBLEMS_URL`)。
*   **导出的功能 (Exports):** `loadPureLocalProblems`, `setupProblemManager`。
*   **IPC 通道 (IPC Channels):**
    *   **处理 (Handles):** `ipcMain.handle('get-problems-from-local')` (初始加载题目，尝试 CDN 同步)。
    *   **处理 (Handles):** `ipcMain.handle('get-pure-local-problems')` (纯粹读取本地题目，不进行 CDN 同步)。
    *   **处理 (Handles):** `ipcMain.handle('refresh-problems')` (强制从 CDN 刷新题目列表)。
    *   **处理 (Handles):** `ipcMain.handle('read-pure-local-problems')` (同 `get-pure-local-problems`，可能是一个别名或冗余)。
    *   **处理 (Handles):** `ipcMain.handle('import-problems')` (导入外部 JSON 文件中的题目)。
    *   **处理 (Handles):** `ipcMain.handle('save-problems-to-local')` (保存整个题目列表到本地文件)。
    *   **发送 (Sends):** `event.sender.send('cpp-output-chunk')` (向渲染进程发送状态/错误信息)。

---

### `src/utils/workspaceManager.ts`

*   **目的 (Purpose):** 管理单个问题的工作区文件（如代码文件 `code.cpp` 和音频文件 `audio.webm`）的读写操作，以及应用程序的用户设置。
*   **关键内容 (Key Contents):**
    *   `setupWorkspaceManager(ipcMain)`: 注册 IPC 处理器来处理工作区文件和应用设置的读写请求。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`)。
    *   `node:fs` (`promises`)。
    *   `node:path`。
    *   `node:buffer` (`Buffer`)。
    *   `../types` (导入 `AppSettings`, `ProblemLifecycleEvent`)。
    *   `./paths` (导入 `getUserWorkspacesRoot`, `getAppSettingsPath`)。
*   **导出的功能 (Exports):** `setupWorkspaceManager`。
*   **IPC 通道 (IPC Channels):**
    *   **处理 (Handles):** `ipcMain.handle('read-problem-code')` (读取指定问题的代码文件)。
    *   **处理 (Handles):** `ipcMain.handle('read-problem-audio')` (读取指定问题的音频文件)。
    *   **处理 (Handles):** `ipcMain.handle('save-problem-workspace')` (保存指定问题的代码和音频文件)。
    *   **处理 (Handles):** `ipcMain.handle('load-app-settings')` (加载应用程序设置)。
    *   **处理 (Handles):** `ipcMain.handle('save-app-settings')` (保存应用程序设置)。
    *   **发出 (Emits):** `ipcMain.emit('record-history-event')` (向 `historyManager` 发送问题工作区保存相关的历史事件)。

---

### `src/utils/exportManager.ts`

*   **目的 (Purpose):** 提供将一个或多个问题的工作区数据（代码、音频、历史记录）导出为 ZIP 压缩文件的功能。
*   **关键内容 (Key Contents):**
    *   `setupExportManager(ipcMain)`: 注册 IPC 处理器来处理导出请求。
*   **依赖项 (Dependencies):**
    *   `electron` (`ipcMain`, `dialog`, `BrowserWindow`)。
    *   `node:fs` (`promises`, `createWriteStream`)。
    *   `node:path`。
    *   `archiver` (用于创建 ZIP 档案)。
    *   `./paths` (导入 `getUserWorkspacesRoot`)。
*   **导出的功能 (Exports):** `setupExportManager`。
*   **IPC 通道 (IPC Channels):**
    *   **处理 (Handles):** `ipcMain.handle('export-problems-to-zip')` (接收导出问题到 ZIP 文件的请求)。

---