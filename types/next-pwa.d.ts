declare module "next-pwa" {
  import type { NextConfig } from "next";

  export type RuntimeCaching = {
    urlPattern:
      | RegExp
      | string
      | ((options: { url: URL; request: Request }) => boolean);
    handler: "CacheFirst" | "NetworkFirst" | "NetworkOnly" | "StaleWhileRevalidate";
    options?: {
      cacheName?: string;
      expiration?: {
        maxEntries?: number;
        maxAgeSeconds?: number;
      };
      cacheableResponse?: {
        statuses?: number[];
      };
      networkTimeoutSeconds?: number;
    } & Record<string, unknown>;
  };

  export interface PWAConfig {
    dest?: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    cacheOnFrontEndNav?: boolean;
    cacheStartUrl?: boolean;
    runtimeCaching?: RuntimeCaching[];
    buildExcludes?: Array<RegExp>;
    fallbacks?: Record<string, string>;
  }

  export default function createNextPwa(
    config?: PWAConfig,
  ): (nextConfig?: NextConfig) => NextConfig;
}

declare module "next-pwa/cache" {
  import type { RuntimeCaching } from "next-pwa";

  const runtimeCaching: RuntimeCaching[];
  export default runtimeCaching;
}
