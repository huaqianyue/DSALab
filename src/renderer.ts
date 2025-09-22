// src/renderer.ts

/**
 * DSALab - C++ Playground
 */

import './index.css'; // 导入主样式文件，应用于整个应用程序的UI
import { App } from './components/App'; // 导入主应用类

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}