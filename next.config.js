/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // These dependencies ship ESM-only builds, so they need Next's (and next/jest's) transpilation step.
  transpilePackages: [
    "pretty-bytes",
    "react-error-boundary",
    "react-resizable-panels",
    "nuqs",
    "three",
    "zod",
    "d3",
    "@tauri-apps/api",
    "@tauri-apps/plugin-dialog",
    "@tauri-apps/plugin-fs",
    "@tauri-apps/plugin-opener",
    "@tauri-apps/plugin-os",
    "@tauri-apps/plugin-shell",
  ],
  turbopack: {
    // stub fs and path for client-side
    // for tiff.js compatibility
    resolveAlias: {
      fs: "./src/lib/empty-module.ts",
      path: "path-browserify",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      // stub fs and path for client-side
      // for tiff.js compatibility
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: require.resolve("path-browserify"),
      };
    }
    return config;
  },
};

module.exports = nextConfig;
