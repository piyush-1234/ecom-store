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

  // Baseline security headers + CSP. The CSP allows 'unsafe-inline' for scripts
  // because Next injects inline bootstrap/flight data without a nonce; a nonce
  // requires middleware and is the documented upgrade path (BLK-013).
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';

    const csp = [
      "default-src 'self'",
      // 'unsafe-eval' is needed by the dev overlay only.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

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
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
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
