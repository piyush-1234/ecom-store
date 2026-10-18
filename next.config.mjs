/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Required for the slim Docker runtime image (see Dockerfile).
  output: 'standalone',

  images: {
    // Placeholder images are local SVGs in phase 1. Remote hosts are added
    // as storage drivers come online (Cloudinary / S3).
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Baseline security headers. The CSP is added in Phase 8 (report-only first).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },

  eslint: {
    // Lint is a separate CI step so a lint error does not block `next build`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
