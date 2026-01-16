import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        qualities: [1, 10, 25, 50, 75, 100],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'pub-6b6ff93daa684afe8aca1537c143add0.r2.dev',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'assets.yner.fr',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'www.dnd5eapi.co',
                port: '',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;