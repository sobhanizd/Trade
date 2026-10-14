import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CryptoPilot AI",
    short_name: "CryptoPilot",
    description: "Read-only crypto market analysis and explainable signals.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#256abf",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
