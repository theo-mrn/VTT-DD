/**
 * Cache des profils publics : une lecture par personne, doublons fusionnés,
 * échecs non mis en cache, champs privés jamais exposés.
 */

const getDoc = jest.fn();

jest.mock("@/lib/firebase", () => ({
  db: {},
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: (ref: { path: string }) => getDoc(ref),
}));

function snap(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data ?? {} };
}

let profiles: typeof import("../profiles");

beforeEach(() => {
  jest.resetModules();
  getDoc.mockReset();
  profiles = require("../profiles");
});

describe("getPublicProfile", () => {
  it("ne lit qu'une fois le même utilisateur, même en parallèle", async () => {
    getDoc.mockResolvedValue(snap({ name: "Théo", pp: "a.png" }));
    const [a, b] = await Promise.all([profiles.getPublicProfile("u1"), profiles.getPublicProfile("u1")]);
    await profiles.getPublicProfile("u1");
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toMatchObject({ uid: "u1", name: "Théo", pp: "a.png" });
  });

  it("n'expose que les champs publics", async () => {
    getDoc.mockResolvedValue(snap({ name: "Théo", email: "t@x.fr", room_id: "r1", stripeCustomerId: "cus_1" }));
    const p = await profiles.getPublicProfile("u1");
    expect(p).not.toHaveProperty("email");
    expect(p).not.toHaveProperty("room_id");
    expect(p).not.toHaveProperty("stripeCustomerId");
  });

  it("affiche le badge premium par défaut, sauf refus explicite", async () => {
    getDoc.mockResolvedValueOnce(snap({ premium: true })).mockResolvedValueOnce(snap({ premium: true, showPremiumBadge: false }));
    expect((await profiles.getPublicProfile("u1"))?.showPremiumBadge).toBe(true);
    expect((await profiles.getPublicProfile("u2"))?.showPremiumBadge).toBe(false);
  });

  it("renvoie null pour un utilisateur inexistant", async () => {
    getDoc.mockResolvedValue(snap(null));
    expect(await profiles.getPublicProfile("absent")).toBeNull();
  });

  it("ne met pas un échec en cache", async () => {
    getDoc.mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce(snap({ name: "Théo" }));
    await expect(profiles.getPublicProfile("u1")).rejects.toThrow("réseau");
    await expect(profiles.getPublicProfile("u1")).resolves.toMatchObject({ name: "Théo" });
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it("relit après invalidation", async () => {
    getDoc.mockResolvedValue(snap({ name: "Théo" }));
    await profiles.getPublicProfile("u1");
    profiles.invalidatePublicProfile("u1");
    await profiles.getPublicProfile("u1");
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it("relit après expiration du cache", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    getDoc.mockResolvedValue(snap({ name: "Théo" }));
    await profiles.getPublicProfile("u1");
    now.mockReturnValue(1_000 + 5 * 60_000 + 1);
    await profiles.getPublicProfile("u1");
    expect(getDoc).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});

describe("getPublicProfiles", () => {
  it("fusionne les doublons", async () => {
    getDoc.mockImplementation((ref: { path: string }) => Promise.resolve(snap({ name: ref.path })));
    const m = await profiles.getPublicProfiles(["u1", "u2", "u1"]);
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(m.get("u2")?.name).toBe("users/u2");
  });
});
