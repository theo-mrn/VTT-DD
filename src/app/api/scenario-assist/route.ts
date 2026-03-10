import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
    try {
        const { context } = await req.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        if (!context) {
            return NextResponse.json({ error: 'No context provided' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const systemPrompt = `
        Tu es un co-auteur et un maître du jeu expert en scénarios de jeu de rôle (Donjons & Dragons).
        Le meneur de jeu a besoin d'inspiration. Voici un résumé des scènes écrites jusqu'à présent (ou le contexte actuel du scénario).
        
        Ta mission :
        Proposer la **suite logique et intéressante** de ce scénario sous forme de NOUVELLE SCÈNE.
        
        CRITÈRES STRICTS POUR LA RÉPONSE :
        - Renvoie UNIQUEMENT un objet JSON valide, sans bloc de code Markdown \`\`\`json ou autre texte autour.
        - Le JSON doit avoir exactement cette structure :
          {
            "title": "Un titre accrocheur pour la scène",
            "content": "Le contenu de la scène, formaté en HTML valide (utilise <h1>, <h2>, <p>, <ul>, <li>, <blockquote>, <strong>, <em>)."
          }
        - L'histoire proposée doit être engageante, inclure de potentiels conflits, mystères ou PNJs à rencontrer.
        - Le HTML renvoyé dans "content" doit être prêt à être injecté dans un éditeur riche (Tiptap).
        `;

        const finalPrompt = `${systemPrompt}\n\nContexte du scénario actuel:\n${context}`;

        const result = await model.generateContent(finalPrompt);
        let text = result.response.text();

        // Nettoyer les balises Markdown ```json si le modèle les a incluses malgré les consignes
        text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');

        const parsedResponse = JSON.parse(text);

        return NextResponse.json({
            title: parsedResponse.title || "Nouvelle Scène Suggérée",
            content: parsedResponse.content || "<p>Erreur lors de la génération du contenu.</p>"
        });

    } catch (error: any) {
        console.error("Gemini Scenario Assist Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to generate scene suggestion' }, { status: 500 });
    }
}
