// src/components/SplitterManager.ts

export class SplitterManager {
    private mainSplitter: HTMLElement | null;
    private rightPanelHorizontalSplitter: HTMLElement | null;
  
    private problemDescriptionPanel: HTMLElement;
    private codeTestPanel: HTMLElement;
    private editorContainer: HTMLElement;
    private testOutputArea: HTMLElement;
  
    private isDraggingMainSplitter = false;
    private isDraggingRightHorizontalSplitter = false;
  
    private onEditorLayout: () => void;
  
    constructor(
      mainSplitter: HTMLElement,
      rightPanelHorizontalSplitter: HTMLElement,
      problemDescriptionPanel: HTMLElement,
      codeTestPanel: HTMLElement,
      editorContainer: HTMLElement,
      testOutputArea: HTMLElement,
      onEditorLayout: () => void
    ) {
      this.mainSplitter = mainSplitter;
      this.rightPanelHorizontalSplitter = rightPanelHorizontalSplitter;
      this.problemDescriptionPanel = problemDescriptionPanel;
      this.codeTestPanel = codeTestPanel;
      this.editorContainer = editorContainer;
      this.testOutputArea = testOutputArea;
      this.onEditorLayout = onEditorLayout;
  
      this.setupEventListeners();
    }
  
    private setupEventListeners(): void {
      this.mainSplitter?.addEventListener('mousedown', this.startDragMainSplitter);
      this.rightPanelHorizontalSplitter?.addEventListener('mousedown', this.startDragRightHorizontalSplitter);
    }
  
    private startDragMainSplitter = (e: MouseEvent) => {
      e.preventDefault();
      this.isDraggingMainSplitter = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', this.dragMainSplitter);
      document.addEventListener('mouseup', this.stopDragMainSplitter);
    };
  
    private dragMainSplitter = (e: MouseEvent) => {
      if (!this.isDraggingMainSplitter) return;
  
      const workspace = document.querySelector('.workspace') as HTMLElement;
      if (!workspace) return;
  
      const workspaceRect = workspace.getBoundingClientRect();
      let newLeftPanelWidth = e.clientX - workspaceRect.left;
  
      const minLeftWidth = 250;
      const minRightWidth = 350;
      const maxLeftWidth = workspaceRect.width - minRightWidth;
  
      newLeftPanelWidth = Math.max(minLeftWidth, Math.min(newLeftPanelWidth, maxLeftWidth));
  
      this.problemDescriptionPanel.style.flexBasis = `${newLeftPanelWidth}px`;
      this.codeTestPanel.style.flexBasis = `${workspaceRect.width - newLeftPanelWidth - (this.mainSplitter?.offsetWidth || 0)}px`;
  
      this.onEditorLayout();
    };
  
    private stopDragMainSplitter = () => {
      this.isDraggingMainSplitter = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.removeEventListener('mousemove', this.dragMainSplitter);
      document.removeEventListener('mouseup', this.stopDragMainSplitter);
    };
  
    private startDragRightHorizontalSplitter = (e: MouseEvent) => {
      e.preventDefault();
      this.isDraggingRightHorizontalSplitter = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', this.dragRightHorizontalSplitter);
      document.addEventListener('mouseup', this.stopDragRightHorizontalSplitter);
    };
  
    private dragRightHorizontalSplitter = (e: MouseEvent) => {
      if (!this.isDraggingRightHorizontalSplitter) return;
  
      const codeTestPanelRect = this.codeTestPanel.getBoundingClientRect();
      const headerHeight = (document.querySelector('.code-test-panel > .panel-header') as HTMLElement)?.offsetHeight || 0;
      let newEditorHeight = e.clientY - codeTestPanelRect.top - headerHeight;
  
      const minEditorHeight = 150;
      const minOutputAreaHeight = 150;
      const maxEditorHeight = codeTestPanelRect.height - headerHeight - minOutputAreaHeight - (this.rightPanelHorizontalSplitter?.offsetHeight || 0);
  
      newEditorHeight = Math.max(minEditorHeight, Math.min(newEditorHeight, maxEditorHeight));
  
      this.editorContainer.style.flexBasis = `${newEditorHeight}px`;
      this.testOutputArea.style.flexBasis = `${codeTestPanelRect.height - headerHeight - newEditorHeight - (this.rightPanelHorizontalSplitter?.offsetHeight || 0)}px`;
  
      this.onEditorLayout();
    };
  
    private stopDragRightHorizontalSplitter = () => {
      this.isDraggingRightHorizontalSplitter = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.removeEventListener('mousemove', this.dragRightHorizontalSplitter);
      document.removeEventListener('mouseup', this.stopDragRightHorizontalSplitter);
    };
  }