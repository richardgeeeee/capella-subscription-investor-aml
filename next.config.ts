import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', '@napi-rs/canvas', 'pdf-parse', 'pdf-to-img', 'pdfjs-dist'],
  // Next's file tracer misses modules that are only dynamically required.
  // `@napi-rs/canvas` is loaded by pdfjs-dist at runtime (via pdf-parse /
  // pdf-to-img) to supply DOMMatrix/ImageData/Path2D, and `pdf-parse` itself
  // dynamically imports pdfjs-dist. Force-include them so the standalone
  // bundle on Railway/Docker contains the native binaries.
  outputFileTracingIncludes: {
    '/api/admin/verify-address': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-*/**/*',
      './node_modules/pdf-parse/**/*',
      './node_modules/pdf-to-img/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
    '/api/submission/verify-address': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-*/**/*',
      './node_modules/pdf-parse/**/*',
      './node_modules/pdf-to-img/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile pictures
      },
    ],
  },
};

export default nextConfig;
