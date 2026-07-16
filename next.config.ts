import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: "frame-ancestors https://*.discord.com https://discord.com",
                    },
                ],
            },
        ];
    },
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
            {
                protocol: 'https',
                hostname: 'media.anakinworld.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'cdn-www.swtor.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'lumiere-a.akamaihd.net',
                port: '',
                pathname: '/**',
            },
        ],
    },
    experimental: {

    },
};

export default nextConfig;