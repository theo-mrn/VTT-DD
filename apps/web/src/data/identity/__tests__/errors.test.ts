import { AuthError, toAuthError } from "../errors";

describe("toAuthError", () => {
  it.each([
    ["auth/invalid-credential", "invalid-credentials"],
    ["auth/wrong-password", "invalid-credentials"],
    ["auth/email-already-in-use", "email-already-in-use"],
    ["auth/popup-closed-by-user", "popup-closed"],
    ["auth/code-inconnu", "unknown"],
  ])("traduit %s en %s", (fournisseur, attendu) => {
    const e = Object.assign(new Error("Firebase: Error"), { code: fournisseur });
    expect(toAuthError(e).code).toBe(attendu);
  });

  it("garde le message d'origine et la cause", () => {
    const e = Object.assign(new Error("Firebase: Error (auth/weak-password)."), { code: "auth/weak-password" });
    const r = toAuthError(e);
    expect(r.message).toBe("Firebase: Error (auth/weak-password).");
    expect(r.cause).toBe(e);
  });

  it("laisse passer une AuthError telle quelle", () => {
    const e = new AuthError("not-authenticated", "x");
    expect(toAuthError(e)).toBe(e);
  });

  it("gère une valeur qui n'est pas une Error", () => {
    expect(toAuthError("boum")).toMatchObject({ code: "unknown", message: "boum" });
  });
});
