import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        qualities: [1, 10, 25, 50, 75, 100],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'assets.yner.fr',
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
            {
                protocol: 'https',
                hostname: 'firebasestorage.googleapis.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    experimental: {

    },
};

export default nextConfig;