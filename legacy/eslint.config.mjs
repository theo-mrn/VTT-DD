import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([".next/**", "out/**", "build/**", "starwars-bundle/**", "next-env.d.ts", "public/**"]),
    {
        // Dette existante (≈1 000 erreurs au passage en monorepo) rétrogradée en
        // avertissements. Le script lint fixe un plafond (--max-warnings) qu'on ne
        // fait que baisser : le code neuf ne peut pas ajouter de dette.
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/ban-ts-comment": "warn",
            "react/no-unescaped-entities": "warn",
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/static-components": "warn",
            "react-hooks/purity": "warn",
            "react-hooks/immutability": "warn",
            "react-hooks/preserve-manual-memoization": "warn",
            "react-hooks/use-memo": "warn",
            "prefer-const": "warn",
            "no-var": "warn",
            "react/display-name": "warn",
            "@typescript-eslint/no-require-imports": "warn",
        },
    },
    {
        // Phase 1 de la migration : Firebase ne doit plus être importé hors de src/data.
        // En avertissement tant que les 156 fichiers ne sont pas migrés, puis en erreur.
        files: ["src/**/*.{ts,tsx,js,jsx}"],
        ignores: ["src/data/**", "src/lib/firebase.js", "src/lib/firebase-admin.ts", "src/__tests__/**"],
        rules: {
            "no-restricted-imports": [
                "warn",
                {
                    patterns: [
                        { group: ["firebase", "firebase/*", "firebase-admin", "firebase-admin/*"], message: "Passer par src/data/* (migration hors Firebase)." },
                        { group: ["@/lib/firebase", "@/lib/firebase-admin"], message: "Passer par src/data/* (migration hors Firebase)." },
                    ],
                },
            ],
        },
    },
]);
