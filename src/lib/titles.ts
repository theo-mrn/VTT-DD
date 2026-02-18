export interface Title {
    id: string; // Slug, e.g., "vagabond"
    label: string; // Display name, e.g., "Vagabond"
    order: number;
    defaultUnlocked: boolean;
    condition?: {
        type: 'time';
        minutes: number;
    } | {
        type: 'event';
        description: string;
    };
}

export type TitleDef = Omit<Title, 'id' | 'order'>;

export const INITIAL_TITLES: TitleDef[] = [
    // Rangs de Progression
    { label: "Vagabond", defaultUnlocked: true },
    { label: "Rat de taverne", defaultUnlocked: true },
    { label: "Aventurier", defaultUnlocked: true },
    { label: "Mercenaire", defaultUnlocked: false, condition: { type: 'time', minutes: 5 } },
    { label: "Explorateur", defaultUnlocked: false, condition: { type: 'time', minutes: 15 } },
    { label: "Vétéran", defaultUnlocked: false, condition: { type: 'time', minutes: 30 } },
    { label: "Héros", defaultUnlocked: false, condition: { type: 'time', minutes: 60 } },
    { label: "Champion", defaultUnlocked: false, condition: { type: 'time', minutes: 120 } },
    { label: "Légende", defaultUnlocked: false, condition: { type: 'time', minutes: 300 } },
    { label: "Demi-Dieu", defaultUnlocked: false, condition: { type: 'time', minutes: 600 } },
    { label: "Divinité", defaultUnlocked: false, condition: { type: 'time', minutes: 1000 } },

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
    { label: "Maudit des dés", defaultUnlocked: false, condition: { type: 'event', description: "Faire un échec critique (1 naturel)" } },
    { label: "Béni des Dieux", defaultUnlocked: false, condition: { type: 'event', description: "Faire une réussite critique (20 naturel)" } },
    { label: "Toujours en Retard", defaultUnlocked: false },
    { label: "Le Barbare", defaultUnlocked: false },
    { label: "L'Érudit", defaultUnlocked: false }
];

import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, query, orderBy, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

// Helper to generate a slug from a label
export const generateSlug = (label: string) => {
    return label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]+/g, "_") // Replace non-alphanumeric with underscore
        .replace(/^_|_$/g, ""); // Trim underscores
};

export const seedTitles = async () => {
    console.log("Starting seed...");

    // Cleanup deprecated titles
    const deprecatedSlugs = ["maudit_par_les_des"];
    for (const slug of deprecatedSlugs) {
        try {
            await deleteDoc(doc(db, "titles", slug));
            console.log(`Removed deprecated title: ${slug}`);
        } catch (e) {
            console.warn(`Failed to remove deprecated title ${slug}`, e);
        }
    }

    for (let i = 0; i < INITIAL_TITLES.length; i++) {
        const t = INITIAL_TITLES[i];
        const slug = generateSlug(t.label);
        const ref = doc(db, "titles", slug);

        const titleData: Title = {
            id: slug,
            label: t.label,
            order: i,
            defaultUnlocked: t.defaultUnlocked,
            ...(t.condition ? { condition: t.condition as any } : {})
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

export const checkAndUnlockTimeTitles = async (uid: string, totalMinutes: number, currentStatus?: Record<string, TitleStatus>) => {
    try {
        const userStatus = currentStatus || await getUserTitlesStatus(uid);
        const titlesToUnlock: string[] = [];
        const newStatus: Record<string, TitleStatus> = {};

        // Check if any locked titles met the criteria
        for (const title of INITIAL_TITLES) {
            const slug = generateSlug(title.label);
            if (userStatus[slug] !== 'unlocked' && title.condition && title.condition.type === 'time') {
                if (totalMinutes >= title.condition.minutes) {
                    titlesToUnlock.push(slug);
                    newStatus[`titles.${slug}`] = 'unlocked';
                }
            }
        }

        if (titlesToUnlock.length > 0) {
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, newStatus);
            return titlesToUnlock; // Return unlocked slugs for notification
        }
    } catch (error) {
        console.error("Error checking time titles:", error);
    }
    return [];
};

