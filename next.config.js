/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "export",
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
