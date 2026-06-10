import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server output for the Docker image and the CLI launcher.
  output: "standalone",
};

export default nextConfig;
