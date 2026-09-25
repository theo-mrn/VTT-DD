import { isAllowedRemoteHost, parseAllowedRemoteUrl } from "@/lib/remote-url";

describe("parseAllowedRemoteUrl", () => {
  const r2Origine = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://pub-abc123.r2.dev";
  });

  afterAll(() => {
    process.env.R2_PUBLIC_URL = r2Origine;
  });

  it("accepte une image d'un hôte autorisé et conserve chemin et requête", () => {
    const url = parseAllowedRemoteUrl("https://assets.yner.fr/tokens/orc.webp?v=2");
    expect(url?.toString()).toBe("https://assets.yner.fr/tokens/orc.webp?v=2");
  });

  it("accepte le bucket R2 configuré", () => {
    expect(parseAllowedRemoteUrl("https://pub-abc123.r2.dev/a.png")).not.toBeNull();
  });

  it("refuse un autre bucket r2.dev", () => {
    expect(parseAllowedRemoteUrl("https://pub-autre.r2.dev/a.png")).toBeNull();
  });

  it("refuse une valeur absente ou invalide", () => {
    expect(parseAllowedRemoteUrl(null)).toBeNull();
    expect(parseAllowedRemoteUrl("")).toBeNull();
    expect(parseAllowedRemoteUrl("pas une url")).toBeNull();
  });

  it.each([
    ["service interne du cluster", "http://gateway:3000/healthz"],
    ["Postgres", "https://postgres-cluster-rw.data:5432/"],
    ["métadonnées du nœud", "http://169.254.169.254/latest/meta-data/"],
    ["localhost", "https://localhost/"],
    ["IP privée", "https://10.0.0.1/"],
    ["hôte inconnu", "https://evil.example/image.png"],
  ])("refuse %s", (_nom, brute) => {
    expect(parseAllowedRemoteUrl(brute)).toBeNull();
  });

  it("refuse le HTTP sur un hôte autorisé", () => {
    expect(parseAllowedRemoteUrl("http://assets.yner.fr/a.png")).toBeNull();
  });

  it("refuse les autres protocoles", () => {
    expect(parseAllowedRemoteUrl("file:///etc/passwd")).toBeNull();
    expect(parseAllowedRemoteUrl("ftp://assets.yner.fr/a.png")).toBeNull();
  });

  it("refuse un port explicite", () => {
    expect(parseAllowedRemoteUrl("https://assets.yner.fr:8443/a.png")).toBeNull();
  });

  it("refuse des identifiants dans l'URL (confusion d'hôte)", () => {
    expect(parseAllowedRemoteUrl("https://assets.yner.fr@evil.example/a.png")).toBeNull();
    expect(parseAllowedRemoteUrl("https://user:pw@assets.yner.fr/a.png")).toBeNull();
  });

  it("refuse les suffixes et préfixes d'un hôte autorisé", () => {
    expect(parseAllowedRemoteUrl("https://assets.yner.fr.evil.example/a.png")).toBeNull();
    expect(parseAllowedRemoteUrl("https://evilassets.yner.fr/a.png")).toBeNull();
  });

  it("ne garde pas le fragment et normalise la casse de l'hôte", () => {
    const url = parseAllowedRemoteUrl("https://ASSETS.YNER.FR/a.png#x");
    expect(url?.toString()).toBe("https://assets.yner.fr/a.png");
  });
});

describe("isAllowedRemoteHost", () => {
  it("ne tient pas compte de la casse", () => {
    expect(isAllowedRemoteHost("CDN.DiscordApp.com")).toBe(true);
  });

  it("n'autorise aucun hôte R2 quand R2_PUBLIC_URL est absent", () => {
    const avant = process.env.R2_PUBLIC_URL;
    delete process.env.R2_PUBLIC_URL;
    expect(isAllowedRemoteHost("pub-abc123.r2.dev")).toBe(false);
    process.env.R2_PUBLIC_URL = avant;
  });
});
