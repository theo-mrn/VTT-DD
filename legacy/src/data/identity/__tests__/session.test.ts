/**
 * Store de session : un seul écouteur d'auth et un seul abonnement au profil,
 * quel que soit le nombre de composants abonnés.
 */

type AuthCb = (u: unknown) => void;
type SnapCb = (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void;

let authCb: AuthCb | null = null;
const snapCbs = new Map<string, SnapCb>();
const onAuthStateChanged = jest.fn((_auth: unknown, cb: AuthCb) => {
  authCb = cb;
  return jest.fn();
});
const arretsProfil: jest.Mock[] = [];
const onSnapshot = jest.fn((ref: { path: string }, cb: SnapCb) => {
  snapCbs.set(ref.path, cb);
  const arret = jest.fn();
  arretsProfil.push(arret);
  return arret;
});

jest.mock("@/lib/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  onAuthStateChanged: (...a: [unknown, AuthCb]) => onAuthStateChanged(...a),
  onSnapshot: (...a: [{ path: string }, SnapCb]) => onSnapshot(...a),
}));

function fbUser(uid: string) {
  return { uid, email: `${uid}@x.fr`, displayName: null, photoURL: null, providerData: [{ providerId: "google.com" }] };
}

function snap(data: Record<string, unknown> | null) {
  return { exists: () => data !== null, data: () => data ?? {} };
}

let session: typeof import("../session");

beforeEach(() => {
  jest.resetModules();
  authCb = null;
  snapCbs.clear();
  arretsProfil.length = 0;
  onAuthStateChanged.mockClear();
  onSnapshot.mockClear();
  session = require("../session");
});

describe("store de session", () => {
  it("démarre en chargement, sans requête avant le premier abonné", () => {
    expect(session.getSession().status).toBe("loading");
    expect(onAuthStateChanged).not.toHaveBeenCalled();
  });

  it("n'ouvre qu'un seul écouteur d'auth pour plusieurs abonnés", () => {
    session.subscribeSession(() => {});
    session.subscribeSession(() => {});
    session.subscribeSession(() => {});
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it("charge l'utilisateur puis son profil, avec un seul abonnement au profil", () => {
    const abonne = jest.fn();
    session.subscribeSession(abonne);

    authCb!(fbUser("u1"));
    expect(session.getSession()).toMatchObject({
      status: "authenticated",
      user: { uid: "u1", providers: ["google"] },
      profileStatus: "loading",
    });
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    snapCbs.get("users/u1")!(snap({ name: "Théo", room_id: "r1", perso: "MJ" }));
    expect(session.getSession().profile).toMatchObject({ name: "Théo", roomId: "r1", perso: "MJ" });
    expect(session.getSession().profileStatus).toBe("ready");
    expect(abonne).toHaveBeenCalled();
  });

  it("garde le profil et ne se réabonne pas quand le même utilisateur est renotifié", () => {
    session.subscribeSession(() => {});
    authCb!(fbUser("u1"));
    snapCbs.get("users/u1")!(snap({ name: "Théo" }));

    authCb!(fbUser("u1")); // rafraîchissement du jeton
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(session.getSession().profile?.name).toBe("Théo");
  });

  it("remet la session à zéro et coupe l'abonnement au profil à la déconnexion", () => {
    session.subscribeSession(() => {});
    authCb!(fbUser("u1"));
    authCb!(null);
    expect(session.getSession()).toEqual({ status: "anonymous", user: null, profile: null, profileStatus: "idle" });
    expect(arretsProfil[0]).toHaveBeenCalled();
  });

  it("ignore un instantané du profil arrivé après un changement d'utilisateur", () => {
    session.subscribeSession(() => {});
    authCb!(fbUser("u1"));
    const ancien = snapCbs.get("users/u1")!;
    authCb!(fbUser("u2"));

    ancien(snap({ name: "ancien" }));
    expect(session.getSession().user?.uid).toBe("u2");
    expect(session.getSession().profile).toBeNull();
  });

  it("signale un profil absent", () => {
    session.subscribeSession(() => {});
    authCb!(fbUser("u1"));
    snapCbs.get("users/u1")!(snap(null));
    expect(session.getSession().profileStatus).toBe("missing");
  });

  it("garde la même référence d'état tant que rien ne change", () => {
    session.subscribeSession(() => {});
    const a = session.getSession();
    expect(session.getSession()).toBe(a);
  });
});
