// Run once to register slash commands with Discord:
// node --env-file=.env scripts/register-discord-commands.mjs

import { readFileSync } from 'fs';

// Load .env manually if not using --env-file
try {
    const env = readFileSync('.env', 'utf8');
    for (const line of env.split('\n')) {
        const match = line.match(/^([^#=\s][^=]*)\s*=\s*(.*)$/);
        if (match) process.env[match[1].trim()] ??= match[2].trim();
    }
} catch { /* .env not found, rely on real env vars */ }

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!APPLICATION_ID || !TOKEN) {
    console.error('Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN in environment');
    process.exit(1);
}

const commands = [
    {
        name: 'roll',
        description: 'Lance des dés',
        options: [
            {
                name: 'notation',
                description: 'Notation des dés (ex: 1d20, 2d6+3, 2d20kh1)',
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: 'login',
        description: 'Connecte ton compte Yner à Discord',
        options: [
            {
                name: 'email',
                description: 'Ton email Yner',
                type: 3, // STRING
                required: true,
            },
            {
                name: 'password',
                description: 'Ton mot de passe Yner',
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: 'link',
        description: 'Lie ton compte Yner à Discord',
        options: [
            {
                name: 'api_key',
                description: 'Ta clé API (obtenue sur yner.fr/api/login)',
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: 'unlink',
        description: 'Délie ton compte Yner de Discord',
    },
];

const res = await fetch(
    `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
    {
        method: 'PUT',
        headers: {
            Authorization: `Bot ${TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
    }
);

if (res.ok) {
    const data = await res.json();
    console.log(`✓ ${data.length} commande(s) enregistrée(s) :`);
    data.forEach(cmd => console.log(`  /${cmd.name} — ${cmd.description}`));
} else {
    const err = await res.text();
    console.error('Erreur Discord API:', res.status, err);
}
