export interface Title {
    id: string; // Slug, e.g., "vagabond"
    label: string; // Display name, e.g., "Vagabond"
    order: number;
    defaultUnlocked: boolean;
}

export const INITIAL_TITLES = [
    // Rangs de Progression
    { label: "Vagabond", defaultUnlocked: true },
    { label: "Rat de taverne", defaultUnlocked: true },
    { label: "Aventurier", defaultUnlocked: true },
    { label: "Mercenaire", defaultUnlocked: false },
    { label: "Explorateur", defaultUnlocked: false },
    { label: "Vétéran", defaultUnlocked: false },
    { label: "Héros", defaultUnlocked: false },
    { label: "Champion", defaultUnlocked: false },
    { label: "Légende", defaultUnlocked: false },
    { label: "Demi-Dieu", defaultUnlocked: false },
    { label: "Divinité", defaultUnlocked: false },

    // Speciaux
    { label: "Maître du Jeu", defaultUnlocked: false },
    { label: "Gardien du Savoir", defaultUnlocked: false },
    { label: "Architecte de Mondes", defaultUnlocked: false },
    { label: "Tueur de Dragons", defaultUnlocked: false },
    { label: "Collectionneur de Dés", defaultUnlocked: false },
    { label: "Optimisateur", defaultUnlocked: false },
    { label: "Roleplayer", defaultUnlocked: false },
    { label: "Stratège", defaultUnlocked: false },
    { label: "Survivant", defaultUnlocked: false },
    { label: "Maudit par les Dés", defaultUnlocked: false },
    { label: "Toujours en Retard", defaultUnlocked: false },
    { label: "Le Barbare", defaultUnlocked: false },
    { label: "L'Érudit", defaultUnlocked: false }
];

import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, query, orderBy, getDoc, updateDoc, arrayUnion } from "firebase/firestore";

// Helper to generate a slug from a label
const generateSlug = (label: string) => {
    return label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]+/g, "_") // Replace non-alphanumeric with underscore
        .replace(/^_|_$/g, ""); // Trim underscores
};

export const seedTitles = async () => {
    const batch = [];
    console.log("Starting seed...");

    for (let i = 0; i < INITIAL_TITLES.length; i++) {
        const t = INITIAL_TITLES[i];
        const slug = generateSlug(t.label);
        const ref = doc(db, "titles", slug);

        const titleData: Title = {
            id: slug,
            label: t.label,
            order: i,
            defaultUnlocked: t.defaultUnlocked
        };

        // We use setDoc to overwrite or create
        await setDoc(ref, titleData);
        console.log(`Seeded: ${t.label}`);
    }
    console.log("Seeding complete.");
};

export const fetchTitles = async (): Promise<Title[]> => {
    const titlesRef = collection(db, "titles");
    const q = query(titlesRef, orderBy("order"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Title);
};

// Export the type for title status
export type TitleStatus = "locked" | "unlocked";

export const getUserTitlesStatus = async (uid: string): Promise<Record<string, TitleStatus>> => {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const data = userSnap.data();
        // Return the titles map if it exists
        if (data.titles) {
            return data.titles;
        }
    }
    return {};
};

export const initializeUserTitles = async (uid: string, allTitles: Title[]) => {
    const userRef = doc(db, "users", uid);

    // Create the map with all titles
    const titlesMap: Record<string, TitleStatus> = {};

    allTitles.forEach(t => {
        titlesMap[t.id] = t.defaultUnlocked ? "unlocked" : "locked";
    });

    await updateDoc(userRef, {
        titles: titlesMap
    });

    return titlesMap;
};
