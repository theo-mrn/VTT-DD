
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
    try {
        const { events } = await req.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        if (!events || !Array.isArray(events) || events.length === 0) {
            return NextResponse.json({ error: 'No events provided' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const systemPrompt = `
        Tu es un maître du jeu expérimenté et un conteur talentueux. Voici une liste d'événements tirés d'une **séance unique** de jeu de rôle (VTT).
        Ta mission est de rédiger un récit fluide, épique et immersif de cette séance spécifique.
        
        CONSIGNES CRITIQUES DE STYLE :
        - ÉVITE absolument les étiquettes du type "**Nom** : ...", "**Lieu** : ...". C'est trop répétitif.
        - À la place, utilise des doubles astérisques (**) UNIQUEMENT pour mettre en valeur les noms importants, les lieux, les objets ou les actions clés DIRECTEMENT dans le texte.
        - Exemple : "Le vaillant **Borin** a franchi les portes de la **Citadelle** pour y trouver une **Épée Maudite**."
        - Utilise un ton narratif (comme un barde ou un chroniqueur).
        - Sois concis (max 150-200 mots).
        - Tu peux utiliser des paragraphes ou des puces stylisées (•) si nécessaire.
        - Distingue bien les Joueurs (PJ), les Alliés et les PNJ (Ennemis/Neutres).

        Structure de l'événement reçu :
        {
          type: string,
          message: string,
          characterName: string,
          characterType: string
        }
        `;

        const eventsText = events.map(e => {
            const typeLabel = e.characterType === 'joueurs' ? 'PJ' : e.characterType === 'allié' ? 'Allié' : 'PNJ';
            return `[${e.type}] (${typeLabel}) ${e.characterName ? e.characterName + ': ' : ''}${e.message}`;
        }).join('\n');

        const finalPrompt = `${systemPrompt}\n\nÉvénements de la séance :\n${eventsText}`;

        const result = await model.generateContent(finalPrompt);
        const text = result.response.text();

        return NextResponse.json({ summary: text });

    } catch (error: any) {
        console.error("Gemini Summarize Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to summarize session' }, { status: 500 });
    }
}
