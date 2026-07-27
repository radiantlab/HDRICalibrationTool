import { jest } from "@jest/globals";
import "@testing-library/jest-dom/jest-globals";

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

// Tauri injects __TAURI_INTERNALS__ into the webview. jsdom has no such global,
// so anything reaching the IPC bridge (convertFileSrc, invoke) throws on a read
// of undefined rather than failing in a way the test can interpret.
globalThis.__TAURI_INTERNALS__ = globalThis.__TAURI_INTERNALS__ || {
  convertFileSrc: (filePath) => `asset://localhost/${filePath}`,
  invoke: () => Promise.resolve(),
  transformCallback: () => 0,
};

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
