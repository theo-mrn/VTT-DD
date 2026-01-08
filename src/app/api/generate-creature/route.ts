
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
    try {
        const { prompt, name, level, description } = await req.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-09-2025" });

        const systemPrompt = `
        You are a D&D 5e assistant. Generate a valid JSON object for a creature based on the user's description.
        If the description is vague, improvise fitting stats.
        
        RETURN ONLY JSON. NO MARKDOWN. NO CODE BLOCKS.
        
        The JSON structure must match this interface:
        interface BestiaryData {
            Nom: string;
            Type: string;
            description: string;
            niveau: number; // Challenge Rating equivalent (1-20)
            PV: number;
            PV_Max: number;
            Defense: number; // AC
            Contact: number; // Attack bonus melee
            Distance: number; // Attack bonus ranged
            Magie: number; // Attack bonus magic
            INIT: number;
            FOR: number;
            DEX: number;
            CON: number;
            INT: number;
            SAG: number;
            CHA: number;
            Actions: Array<{
                Nom: string;
                Description: string;
                Toucher: number; // Hit bonus
            }>;
        }

        Example logic for stats:
        - PV_Max usually around (Level * 8) + CON_Mod * Level
        - Defense around 10 + DEX_Mod + Armor
        - Attributes (FOR, DEX, etc) standard 1-30 range.
        `;

        // Construct a richer prompt based on inputs
        let userPrompt = '';
        if (name && level) {
            userPrompt = `Generate a Level ${level} creature named '${name}'.`;
            if (description || prompt) userPrompt += ` Description: ${description || prompt}`;
        } else {
            userPrompt = prompt || description;
        }

        const finalPrompt = `${systemPrompt}\n\nUser Prompt: ${userPrompt}`;

        const result = await model.generateContent(finalPrompt);
        const response = result.response;
        let text = response.text();

        // Clean up markdown if present (GEMINI sometimes adds it despite instructions)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const creatureData = JSON.parse(text);

        // --- IMAGE GENERATION ---
        try {
            const imagePrompt = `Generate a fantasy oil painting of ${creatureData.Nom}: ${creatureData.description || prompt}. High quality, detailed, D&D style.`;

            console.log("Attempting Image Generation with gemini-2.5-flash-image (Nano Banana)");

            // Nano Banana (Gemini 2.5 Flash Image) uses generateContent, not predict.
            // It generates image parts in the response.
            const imageModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

            const imageResult = await imageModel.generateContent(imagePrompt);
            const imageResponse = imageResult.response;

            // Check if we have parts
            // Usually formatting is candidates[0].content.parts[0]
            // But helper gives useful accessors? Not strictly for images yet in all SDks.
            // Let's inspect the first part.

            // Note: GoogleGenerativeAI SDK response structure:
            // response.candidates[0].content.parts[...]

            if (imageResponse.candidates && imageResponse.candidates[0].content.parts.length > 0) {
                // Iterate to find inlineData (image)
                // Or it might be executable code if we aren't careful, but 'gemini-2.5-flash-image' is tuned for images.

                for (const part of imageResponse.candidates[0].content.parts) {
                    if (part.inlineData) {
                        creatureData.image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        break;
                    }
                }

                if (!creatureData.image) {
                    console.warn("No inlineData found in Nano Banana response parts:", JSON.stringify(imageResponse.candidates[0].content.parts));
                    creatureData.debugImageError = "No image data found in response";
                }
            } else {
                console.warn("No candidates or parts in Nano Banana response");
                creatureData.debugImageError = "No candidates returned";
            }

        } catch (imgErr: any) {
            console.error("Image Generation Exception:", imgErr);
            creatureData.debugImageError = imgErr.message;
        }

        return NextResponse.json(creatureData);

    } catch (error: any) {
        console.error("Gemini Generation Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to generate creature' }, { status: 500 });
    }
}
