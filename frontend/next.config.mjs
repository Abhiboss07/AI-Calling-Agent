/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*', // Proxy backend
      },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;
