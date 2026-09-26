'use client';

/**
 * Paramètres de la campagne, repris de l'ancienne app (CampaignSettingsManager) :
 * titre, description, joueurs max, image, visibilité et création de
 * personnages. Le MJ propriétaire peut aussi supprimer la campagne.
 */
import { Loader2, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { checkImage } from '@/lib/profile';
import {
  deleteCampaign,
  updateCampaign,
  uploadCampaignImage,
  type CampaignDetail,
} from '@/lib/campaigns';
import { Notice } from './elements';

export function CampaignSettingsManager({
  campaign,
  isOwner,
  onSaved,
}: {
  campaign: CampaignDetail;
  isOwner: boolean;
  onSaved(): void;
}) {
  const router = useRouter();
  const [data, setData] = useState({
    name: campaign.name,
    description: campaign.description ?? '',
    isPublic: campaign.isPublic ?? false,
    characterCreation: campaign.characterCreation !== false,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(file ? checkImage(file) : null);
    setImageFile(file && !checkImage(file) ? file : null);
  }

  async function handleSave() {
    if (!data.name.trim()) {
      setError('Le titre est requis.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateCampaign(campaign.id, { ...data, name: data.name.trim() });
      if (imageFile) await uploadCampaignImage(campaign.id, imageFile);
      setImageFile(null);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCampaign(campaign.id);
      router.push('/campaigns');
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 bg-[var(--bg-dark)] p-4 text-[var(--text-primary)] sm:p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="campaign-title">Titre de la campagne</Label>
          <Input
            id="campaign-title"
            value={data.name}
            maxLength={100}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="border-[var(--border-color)] bg-[var(--bg-card)]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campaign-description">Description</Label>
          <Textarea
            id="campaign-description"
            value={data.description}
            maxLength={2000}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            className="min-h-[100px] border-[var(--border-color)] bg-[var(--bg-card)]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="campaign-image">Image de la campagne</Label>
          <Input
            id="campaign-image"
            type="file"
            onChange={handleFileChange}
            className="border-[var(--border-color)] bg-[var(--bg-card)]"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />
        </div>

        <div className="flex flex-col gap-4 pt-2">
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] p-3"
            style={{ background: 'color-mix(in srgb, var(--bg-card) 50%, transparent)' }}
          >
            <div className="space-y-0.5">
              <Label htmlFor="campaign-public">Campagne Publique</Label>
              <p className="text-xs text-muted-foreground">Visible dans la liste des campagnes</p>
            </div>
            <Switch
              id="campaign-public"
              checked={data.isPublic}
              onCheckedChange={(checked) => setData({ ...data, isPublic: checked })}
            />
          </div>

          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] p-3"
            style={{ background: 'color-mix(in srgb, var(--bg-card) 50%, transparent)' }}
          >
            <div className="space-y-0.5">
              <Label htmlFor="campaign-creation">Création de personnages</Label>
              <p className="text-xs text-muted-foreground">
                Autoriser les joueurs à créer leurs fiches
              </p>
            </div>
            <Switch
              id="campaign-creation"
              checked={data.characterCreation}
              onCheckedChange={(checked) => setData({ ...data, characterCreation: checked })}
            />
          </div>
        </div>
      </div>

      {error && <Notice>{error}</Notice>}
      {saved && !error && <Notice tone="succes">Paramètres mis à jour !</Notice>}

      <Button
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full bg-[var(--accent-brown)] font-bold text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)]"
      >
        {saving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Sauvegarder les modifications
      </Button>

      {isOwner && (
        <div className="space-y-3 rounded-lg border border-red-900/40 p-4">
          <p className="text-sm font-semibold text-red-300">Supprimer la campagne</p>
          <p className="text-xs text-zinc-400">
            Action irréversible : la campagne, ses sessions et sa discussion disparaissent. Les
            personnages restent dans « Mes personnages ». Pour confirmer, tapez{' '}
            <span className="font-mono text-zinc-300">{campaign.name}</span> ci-dessous :
          </p>
          <Input
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            placeholder={campaign.name}
            disabled={deleting}
            aria-label="Nom de la campagne à supprimer"
            className="border-red-900/40 bg-black/30 text-zinc-100"
          />
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={deleting || confirmDelete !== campaign.name}
            className="w-full gap-2"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Supprimer définitivement
          </Button>
        </div>
      )}
    </div>
  );
}
