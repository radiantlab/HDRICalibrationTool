/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "export",
	webpack: (config, { isServer }) => {
		if (!isServer) {
			config.resolve = config.resolve || {};
			// stub fs and path for client-side
			// for tiff.js compatibility
			config.resolve.fallback = {
				...(config.resolve.fallback || {}),
				fs: false,
				path: false,
			};
		}
		return config;
	},
};

module.exports = nextConfig;
