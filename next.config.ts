import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.BUILD_TARGET === "electron" ? "standalone" : undefined,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
