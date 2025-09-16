import type { NextConfig } from "next";
import createNextPwa, { type RuntimeCaching } from "next-pwa";

const isDev = process.env.NODE_ENV === "development";

const documentCache: RuntimeCaching = {
  urlPattern: ({ request }) => request?.mode === "navigate",
  handler: "NetworkFirst",
  options: {
    cacheName: "html-cache",
    networkTimeoutSeconds: 10,
    expiration: {
      maxEntries: 32,
      maxAgeSeconds: 24 * 60 * 60,
    },
  },
};

const assetCache: RuntimeCaching = {
  urlPattern: ({ request }) => {
    const destination = request?.destination;
    return destination === "style" || destination === "script" || destination === "worker";
  },
  handler: "StaleWhileRevalidate",
  options: {
    cacheName: "asset-cache",
    expiration: {
      maxEntries: 64,
      maxAgeSeconds: 7 * 24 * 60 * 60,
    },
  },
};

const imageCache: RuntimeCaching = {
  urlPattern: ({ request }) => request?.destination === "image",
  handler: "StaleWhileRevalidate",
  options: {
    cacheName: "image-cache",
    expiration: {
      maxEntries: 128,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    },
  },
};

const apiCache: RuntimeCaching = {
  urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/api"),
  handler: "NetworkFirst",
  options: {
    cacheName: "api-cache",
    cacheableResponse: {
      statuses: [0, 200],
    },
    networkTimeoutSeconds: 10,
    expiration: {
      maxEntries: 32,
      maxAgeSeconds: 24 * 60 * 60,
    },
  },
};

const withPWA = createNextPwa({
  dest: "public",
  disable: isDev,
  register: true,
  skipWaiting: true,
  cacheStartUrl: true,
  cacheOnFrontEndNav: true,
  runtimeCaching: [documentCache, assetCache, imageCache, apiCache],
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
