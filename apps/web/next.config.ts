import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le moteur de calcul est partagé en TypeScript source.
  transpilePackages: ["@dpms/core"],
  // ExcelJS reste un module Node classique (non regroupé).
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
