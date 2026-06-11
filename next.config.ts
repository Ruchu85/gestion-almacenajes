import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        // Documentos HTML (páginas): nunca servir desde la caché del navegador
        // ni desde el bfcache, de modo que cada deploy se vea al recargar sin
        // tener que borrar la caché manualmente. Los assets con hash de
        // /_next/static y los archivos con extensión (imágenes de /public, etc.)
        // quedan excluidos y conservan su cache inmutable/normal.
        source: "/((?!_next/|.*\\.).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
