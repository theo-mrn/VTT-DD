'use client';

/** Création d'une campagne, reprise de l'ancienne page « creer ». */
import { ArrowRight, Check, Globe, ImagePlus, Loader2, Plus, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Loading } from '@/components/account/elements';
import {
  accentTint,
  aclonica,
  Divider,
  fieldInput,
  fieldLabel,
  glass,
  HeroTitle,
  Notice,
  primaryButton,
  CampaignImage,
  SplitLayout,
} from '@/components/campaigns/elements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { checkImage } from '@/lib/profile';
import { useResource } from '@/lib/resource';
import { createCampaign, uploadCampaignImage } from '@/lib/campaigns';
import { listSystems } from '@/lib/systems';
import { cn } from '@/lib/utils';

export default function NewCampaignPage() {
  const router = useRouter();
  const systems = useResource('systemes', listSystems);
  const [form, setForm] = useState({
    name: '',
    description: '',
    isPublic: false,
    characterCreation: true,
    systemId: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Campagne créée mais image refusée : on propose de continuer quand même. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  // Premier système par défaut
  useEffect(() => {
    if (!form.systemId && systems.data?.length)
      setForm((f) => ({ ...f, systemId: systems.data![0]!.id }));
  }, [systems.data, form.systemId]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const invalid = checkImage(file);
    setError(invalid);
    setImageFile(invalid ? null : file);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (creating || !form.systemId) return;
    setCreating(true);
    setError(null);
    let id: string | null = null;
    try {
      const created = await createCampaign({
        name: form.name.trim(),
        systemId: form.systemId,
        description: form.description.trim(),
        isPublic: form.isPublic,
        characterCreation: form.characterCreation,
      });
      id = created.id;
      if (imageFile) await uploadCampaignImage(id, imageFile);
      router.push(`/campaigns/${id}/characters`);
    } catch (err) {
      if (id) {
        setCreatedId(id);
        setError(
          `La campagne est créée, mais l'image n'a pas pu être envoyée : ${errorMessage(err)}`,
        );
      } else setError(errorMessage(err));
      setCreating(false);
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <SplitLayout
      aside={
        <>
          <HeroTitle
            kicker="Nouvelle campagne"
            subtitle="Configurez votre campagne et invitez vos joueurs à rejoindre la quête"
          >
            Forgez votre
            <br />
            aventure
          </HeroTitle>

          {/* Aperçu de la tuile */}
          <div
            className="overflow-hidden rounded-2xl border border-[var(--border-color)] backdrop-blur-sm"
            style={glass()}
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-dark)]">
              <CampaignImage url={imagePreview} alt="Aperçu" zoom={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                <Users className="h-3 w-3" />0
              </div>
              {form.isPublic && (
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-1 text-xs font-bold text-green-400 backdrop-blur-sm">
                  <Globe className="h-3 w-3" />
                  Publique
                </div>
              )}
            </div>
            <div className="space-y-1 p-4">
              <h3 className="line-clamp-1 text-base font-bold text-[var(--text-primary)]">
                {form.name || 'Titre de la campagne'}
              </h3>
              <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                {form.description || 'La description apparaîtra ici...'}
              </p>
            </div>
          </div>

          <Divider />
        </>
      }
    >
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2" style={accentTint(10, 20)}>
            <Plus className="h-5 w-5 text-[var(--accent-brown)]" />
          </div>
          <h2 className={cn(aclonica, 'text-2xl font-bold text-[var(--text-primary)]')}>
            Configuration
          </h2>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="title" className={fieldLabel}>
              Titre *
            </label>
            <Input
              id="title"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Le Secret des Anciens"
              maxLength={100}
              required
              className={fieldInput}
              style={glass()}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className={fieldLabel}>
              Description *
            </label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Décrivez votre aventure, l'ambiance, les prérequis..."
              rows={4}
              maxLength={2000}
              required
              className={cn(fieldInput, 'h-auto resize-none p-4')}
              style={glass()}
            />
          </div>

          <div className="space-y-2">
            <p className={fieldLabel}>Système de règles *</p>
            <p className="ml-1 text-xs text-[var(--text-secondary)]">
              Ce choix est définitif : il ne sera plus possible d&apos;en changer une fois la
              campagne créée.
            </p>
            {systems.error && !systems.data ? (
              <Notice>{systems.error}</Notice>
            ) : !systems.data ? (
              <Loading text="Chargement des systèmes…" />
            ) : (
              <div
                className="grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Système de règles"
              >
                {systems.data.map((system) => {
                  const selected = form.systemId === system.id;
                  return (
                    <button
                      key={system.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set('systemId', system.id)}
                      className="rounded-xl border p-4 text-left backdrop-blur-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brown)]"
                      style={{
                        borderColor: selected ? 'var(--accent-brown)' : 'var(--border-color)',
                        background: selected
                          ? 'color-mix(in srgb, var(--accent-brown) 12%, transparent)'
                          : 'color-mix(in srgb, var(--bg-card) 40%, transparent)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">
                          {system.nom}
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-[var(--accent-brown)]" />
                        )}
                      </div>
                      {system.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                          {system.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className={fieldLabel}>Image de couverture</p>
            <label
              className="group flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-color)] backdrop-blur-sm transition-all hover:border-[var(--accent-brown)] hover:bg-[color-mix(in_srgb,var(--accent-brown)_5%,transparent)]"
              style={glass(30)}
            >
              <div className="flex items-center gap-3 px-4">
                <ImagePlus className="h-6 w-6 shrink-0 text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent-brown)]" />
                <p className="truncate text-sm text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
                  {imageFile ? imageFile.name : 'Cliquez pour uploader une image'}
                </p>
              </div>
              <input
                type="file"
                className="sr-only"
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif"
              />
            </label>
          </div>

          <div className="grid gap-3">
            <ToggleRow
              icon={Globe}
              title="Campagne publique"
              description="Visible dans les campagnes en ligne"
              checked={form.isPublic}
              onChange={(v) => set('isPublic', v)}
            />
            <ToggleRow
              icon={Sparkles}
              title="Création libre"
              description="Les joueurs peuvent créer un personnage"
              checked={form.characterCreation}
              onChange={(v) => set('characterCreation', v)}
            />
          </div>

          {error && <Notice>{error}</Notice>}
          {createdId ? (
            <Button asChild className={cn(primaryButton, 'h-14 w-full gap-3 rounded-xl text-lg')}>
              <Link href={`/campaigns/${createdId}/characters`}>
                Continuer vers la campagne <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={creating || !form.systemId}
              className={cn(
                primaryButton,
                'h-14 w-full gap-3 rounded-xl text-lg shadow-[0_4px_25px_rgba(192,160,128,0.3)] transition-all hover:shadow-[0_4px_35px_rgba(192,160,128,0.5)] disabled:opacity-40',
              )}
            >
              {creating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Créer la campagne <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          )}
        </form>
      </div>
    </SplitLayout>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] p-4 backdrop-blur-sm transition-all hover:border-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)]"
      style={glass(40)}
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg p-1.5"
          style={{ background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)' }}
        >
          <Icon className="h-4 w-4 text-[var(--accent-brown)]" />
        </div>
        <div className="space-y-0.5">
          <span className="block text-sm font-bold text-[var(--text-primary)]">{title}</span>
          <span className="block text-xs text-[var(--text-secondary)]">{description}</span>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </label>
  );
}
