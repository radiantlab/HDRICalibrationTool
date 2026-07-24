import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver, which react-resizable-panels requires.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

// Components render outside of a real Tauri webview in tests, so calls into
// the Tauri IPC bridge need a stand-in.
jest.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: () => Promise.resolve(() => {}),
  }),
}));
