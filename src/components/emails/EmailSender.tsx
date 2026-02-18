'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function EmailSender() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const [mode, setMode] = useState<'single' | 'audience'>('single');

    const sendEmail = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: null, message: '' });

        const formData = new FormData(e.currentTarget);
        const data = {
            to: formData.get('to'),
            subject: formData.get('subject'),
            firstName: formData.get('firstName'),
            campaignName: formData.get('campaignName'),
            audienceId: formData.get('audienceId'),
            roomId: formData.get('roomId'),
        };

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to send email');
            }

            const count = result.data ? result.data.length : (result.id ? 1 : 'multiple');
            setStatus({ type: 'success', message: `Emails sent! Count: ${count}` });
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-[450px]">
            <CardHeader>
                <CardTitle>Organiser une Session</CardTitle>
                <CardDescription>Envoyer une invitation pour la prochaine partie.</CardDescription>
                <div className="flex gap-2 pt-2">
                    <Button variant={mode === 'single' ? 'default' : 'outline'} onClick={() => setMode('single')} size="sm">Liste Manuelle</Button>
                    <Button variant={mode === 'audience' ? 'default' : 'outline'} onClick={() => setMode('audience')} size="sm">Audience Resend</Button>
                </div>
            </CardHeader>
            <form onSubmit={sendEmail}>
                <CardContent className="grid w-full items-center gap-4">
                    {mode === 'single' ? (
                        <>
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="to">Destinataires (séparés par des virgules)</Label>
                                <Input id="to" name="to" placeholder="joueur1@mail.com, joueur2@mail.com" required />
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="audienceId">ID de l'Audience Resend</Label>
                            <Input id="audienceId" name="audienceId" placeholder="Laisser vide pour utiliser le .env" />
                            <p className="text-xs text-muted-foreground">Les prénoms seront récupérés de l'audience si disponible.</p>
                        </div>
                    )}

                    {mode === 'single' && (
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="firstName">Prénom (Défaut pour le groupe)</Label>
                            <Input id="firstName" name="firstName" placeholder="Aventurier" defaultValue="Aventurier" />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="roomId">ID de la Salle (Optionnel)</Label>
                            <Input id="roomId" name="roomId" placeholder="Room ID Firebase" />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="campaignName">Nom (Override)</Label>
                            <Input id="campaignName" name="campaignName" placeholder="Titre manuel" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Si Room ID est renseigné, le titre sera récupéré de Firebase.</p>

                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="subject">Sujet (Optionnel)</Label>
                        <Input id="subject" name="subject" placeholder="Laissez vide pour défaut" />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2">
                    <Button className="w-full" type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Envoyer l'Invitation
                    </Button>
                    {status.message && (
                        <p className={`text-sm ${status.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                            {status.message}
                        </p>
                    )}
                </CardFooter>
            </form>
        </Card>
    );
}
