import { DiscordSDK } from "@discord/embedded-app-sdk";

let discordSdk: DiscordSDK | null = null;
let cachedToken: string | null = null;
let authPromise: Promise<{ sdk: DiscordSDK; access_token: string }> | null = null;

async function _setupDiscord() {
  if (discordSdk && cachedToken) return { sdk: discordSdk, access_token: cachedToken };
  discordSdk = new DiscordSDK("1495752182837018764");
  await discordSdk.ready();

  const { code } = await discordSdk!.commands.authorize({
    client_id: "1495752182837018764",
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "guilds"],
  });

  const response = await fetch("/api/discord/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  const { access_token } = await response.json();

  await discordSdk!.commands.authenticate({ access_token });

  cachedToken = access_token;
  return { sdk: discordSdk!, access_token };
}

export function setupDiscord() {
  if (!authPromise) authPromise = _setupDiscord();
  return authPromise;
}

export function isDiscordActivity(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has("frame_id") || window.location.hostname.endsWith(".discordsays.com");
}
