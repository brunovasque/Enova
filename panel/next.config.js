/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Prevent pdfjs-dist from trying to import Node.js canvas bindings during SSR build
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
