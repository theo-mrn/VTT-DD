import { getContrastColor } from "@/utils/imageUtils";

describe("getContrastColor", () => {
  it("retourne blanc (#ffffff) pour un fond noir", () => {
    expect(getContrastColor("#000000")).toBe("#ffffff");
  });

  it("retourne noir (#000000) pour un fond blanc", () => {
    expect(getContrastColor("#ffffff")).toBe("#000000");
  });

  it("retourne blanc pour un fond sombre (bleu marine)", () => {
    expect(getContrastColor("#1a237e")).toBe("#ffffff");
  });

  it("retourne noir pour un fond clair (jaune)", () => {
    expect(getContrastColor("#ffeb3b")).toBe("#000000");
  });

  it("retourne blanc pour un fond rouge vif", () => {
    expect(getContrastColor("#f44336")).toBe("#ffffff");
  });

  it("retourne blanc si la valeur est vide", () => {
    expect(getContrastColor("")).toBe("#ffffff");
  });

  it("retourne blanc si la valeur ne commence pas par #", () => {
    expect(getContrastColor("ffffff")).toBe("#ffffff");
    expect(getContrastColor("red")).toBe("#ffffff");
  });

  it("gère les couleurs grises (autour du seuil YIQ 128)", () => {
    // #808080 = rgb(128,128,128) → YIQ ≈ 128 → noir
    expect(getContrastColor("#808080")).toBe("#000000");
    // #7f7f7f → YIQ < 128 → blanc
    expect(getContrastColor("#7f7f7f")).toBe("#ffffff");
  });
});
