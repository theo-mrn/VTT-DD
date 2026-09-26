import { ScenarioLayout } from "@/components/(scenario)/ScenarioLayout"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Éditeur de Scénario | VTT D&D",
    description: "Éditeur de scénario et de campagne pour le JDR",
}

export default async function ScenarioPage({ params }: { params: Promise<{ roomid: string }> }) {
    const resolvedParams = await params;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <main className="flex-1">
                <ScenarioLayout roomId={resolvedParams.roomid} />
            </main>
        </div>
    )
}
