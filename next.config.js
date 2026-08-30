/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      resolveAlias: {
        '@/*': './src/*',
      },
    },
  },
}

module.exports = nextConfig