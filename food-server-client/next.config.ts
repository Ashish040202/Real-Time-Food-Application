import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // "standalone" output is used only for Docker builds
  // output: "standalone",
};

export default nextConfig;
