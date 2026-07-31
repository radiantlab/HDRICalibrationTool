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

// jsdom does not expose TextEncoder/TextDecoder, which browsers and workers
// both do. The pipeline's Radiance header parsing uses them.
const { TextDecoder, TextEncoder } = require("node:util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

// jsdom does not implement structuredClone, which fake-indexeddb uses to
// clone values into and out of the store, the same way a browser's real
// IndexedDB does. v8's own serializer round-trip clones the same set of
// types the structured clone algorithm does, so it stands in faithfully.
const v8 = require("node:v8");
global.structuredClone =
  global.structuredClone || ((value) => v8.deserialize(v8.serialize(value)));

// jsdom exposes crypto but not crypto.subtle, which preset hashing uses.
const { webcrypto } = require("node:crypto");
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
}

// Tauri injects __TAURI_INTERNALS__ into the webview. jsdom has no such global,
// so anything reaching the IPC bridge (convertFileSrc, invoke) throws on a read
// of undefined rather than failing in a way the test can interpret.
globalThis.__TAURI_INTERNALS__ = globalThis.__TAURI_INTERNALS__ || {
  convertFileSrc: (filePath) => `asset://localhost/${filePath}`,
  invoke: () => Promise.resolve(),
  transformCallback: () => 0,
};

// The event plugin keeps its own injected global, used when a listener is torn
// down. Without it, unmounting a component that listens throws during cleanup.
globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__ =
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__ || {
    unregisterListener: () => undefined,
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
