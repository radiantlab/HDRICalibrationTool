import { jest } from "@jest/globals";
import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver, which react-resizable-panels requires.
class ResizeObserverMock {
  observe() {
    // no-op: tests don't need real resize notifications
  }
  unobserve() {
    // no-op: tests don't need real resize notifications
  }
  disconnect() {
    // no-op: tests don't need real resize notifications
  }
}
global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

// Components render outside of a real Tauri webview in tests, so calls into
// the Tauri IPC bridge need a stand-in.
jest.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: () =>
      Promise.resolve(() => {
        // no-op unsubscribe stub
      }),
  }),
}));
