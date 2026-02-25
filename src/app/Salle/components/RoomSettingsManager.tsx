import React, { useState, useEffect } from 'react';
import { db, doc, getDoc, updateDoc, auth, storage, collection, getDocs } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Image as ImageIcon, Loader2 } from 'lucide-react';

import { GuestSelector } from '@/components/ui/guest-selector';

interface RoomSettingsManagerProps {
    roomId: string;
}

export function RoomSettingsManager({ roomId }: RoomSettingsManagerProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [roomData, setRoomData] = useState({
        title: '',
        description: '',
        maxPlayers: 4,
        isPublic: false,
        allowCharacterCreation: true,
        imageUrl: ''
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [currentOccupantsCount, setCurrentOccupantsCount] = useState(1);

    useEffect(() => {
        const fetchRoomData = async () => {
            setLoading(true);
            try {
                const roomDoc = await getDoc(doc(db, 'Salle', roomId));
                if (roomDoc.exists()) {
                    const data = roomDoc.data();
                    setRoomData({
                        title: data.title || '',
                        description: data.description || '',
                        maxPlayers: data.maxPlayers || 4,
                        isPublic: data.isPublic || false,
                        allowCharacterCreation: data.allowCharacterCreation !== false,
                        imageUrl: data.imageUrl || ''
                    });

                    // Fetch current players count (excluding MJ)
                    const nomsSnapshot = await getDocs(collection(db, `salles/${roomId}/Noms`));
                    const playersCount = nomsSnapshot.docs.filter(doc => doc.data().nom !== 'MJ').length;
                    setCurrentOccupantsCount(playersCount);
                }
            } catch (error) {
                console.error("Erreur lors de la récupération des paramètres:", error);
                toast.error("Échec du chargement des paramètres");
            } finally {
                setLoading(false);
            }
        };

        if (roomId) fetchRoomData();
    }, [roomId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            let imageUrl = roomData.imageUrl;

            if (imageFile) {
                const imageRef = ref(storage, `Salle/${roomId}/room-image`);
                await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(imageRef) as string;
            }

            await updateDoc(doc(db, 'Salle', roomId), {
                ...roomData,
                imageUrl
            });

            toast.success("Paramètres mis à jour !");
            setImageFile(null);
        } catch (error) {
            console.error("Erreur lors de la sauvegarde:", error);
            toast.error("Échec de la sauvegarde");
        } finally {
            setSaving(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-brown)]" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-[var(--bg-dark)] text-[var(--text-primary)]">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="title">Titre de la salle</Label>
                    <Input
                        id="title"
                        value={roomData.title}
                        onChange={(e) => setRoomData({ ...roomData, title: e.target.value })}
                        className="bg-[var(--bg-card)] border-[var(--border-color)]"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={roomData.description}
                        onChange={(e) => setRoomData({ ...roomData, description: e.target.value })}
                        className="bg-[var(--bg-card)] border-[var(--border-color)] min-h-[100px]"
                    />
                </div>

                <div className="space-y-4 py-2 border-y border-[var(--border-color)]/30">
                    <GuestSelector
                        title="Nombre de joueurs max"
                        description={currentOccupantsCount > 0 ? `Il y a actuellement ${currentOccupantsCount} joueur${currentOccupantsCount > 1 ? 's' : ''} dans la salle` : "Définit la limite de places dans la salle"}
                        maxGuests={12}
                        minGuests={currentOccupantsCount}
                        initialValue={roomData.maxPlayers}
                        onValueChange={(val) => setRoomData({ ...roomData, maxPlayers: val })}
                        className="max-w-none p-0"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="image">Image de fond (Map)</Label>
                    <Input
                        id="image"
                        type="file"
                        onChange={handleFileChange}
                        className="bg-[var(--bg-card)] border-[var(--border-color)]"
                        accept="image/*"
                    />
                </div>

                <div className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)]/50 border border-[var(--border-color)]">
                        <div className="space-y-0.5">
                            <Label htmlFor="isPublic">Salle Publique</Label>
                            <p className="text-xs text-muted-foreground">Visible dans la liste des salles</p>
                        </div>
                        <Switch
                            id="isPublic"
                            checked={roomData.isPublic}
                            onCheckedChange={(checked) => setRoomData({ ...roomData, isPublic: checked })}
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)]/50 border border-[var(--border-color)]">
                        <div className="space-y-0.5">
                            <Label htmlFor="allowChar">Création de personnages</Label>
                            <p className="text-xs text-muted-foreground">Autoriser les joueurs à créer leurs fiches</p>
                        </div>
                        <Switch
                            id="allowChar"
                            checked={roomData.allowCharacterCreation}
                            onCheckedChange={(checked) => setRoomData({ ...roomData, allowCharacterCreation: checked })}
                        />
                    </div>
                </div>
            </div>

            <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-[var(--bg-dark)] font-bold"
            >
                {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                    <Save className="h-4 w-4 mr-2" />
                )}
                Sauvegarder les modifications
            </Button>
        </div>
    );
}
