'use client';

/** Prochaines sessions de la campagne, reprises de l'ancienne app (CampaignSessions). */
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useResource } from '@/lib/resource';
import { addSession, deleteSession, listSessions } from '@/lib/campaigns';

export function CampaignSessions({
  campaignId,
  isOwner,
}: {
  campaignId: string;
  isOwner: boolean;
}) {
  const sessions = useResource(`campagne:${campaignId}:sessions`, () => listSessions(campaignId));
  const [newDate, setNewDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const upcoming = (sessions.data ?? [])
    .map((s) => ({ ...s, when: new Date(s.date) }))
    .filter((s) => !Number.isNaN(s.when.getTime()) && s.when.getTime() > now)
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  async function handleAdd() {
    if (!newDate) return;
    const date = new Date(newDate);
    if (Number.isNaN(date.getTime())) return;
    setAdding(true);
    setError(null);
    try {
      await addSession(campaignId, date);
      setNewDate('');
      await sessions.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    sessions.update((list) => list?.filter((s) => s.id !== id));
    try {
      await deleteSession(campaignId, id);
    } catch (err) {
      setError(errorMessage(err));
      void sessions.reload();
    }
  }

  return (
    <Card className="border-none bg-transparent text-[var(--text-primary)] ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Prochaines sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((session) => (
              <div
                key={session.id}
                className="group flex items-center justify-between rounded-lg bg-muted/50 p-2"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <CalendarDays className="h-4 w-4 flex-shrink-0 text-[var(--accent-brown)]" />
                  <span className="text-sm font-medium capitalize">
                    {session.when.toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.when.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {session.title && (
                    <span className="w-full truncate text-xs text-[var(--text-secondary)]">
                      {session.title}
                    </span>
                  )}
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(session.id)}
                    aria-label="Supprimer la session"
                    className="p-1 text-red-400 opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {sessions.loading && !sessions.data ? 'Chargement…' : 'Aucune session prévue'}
          </p>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        {isOwner && (
          <div className="flex items-center gap-2 border-t border-[var(--border-color)] pt-2">
            <Input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="Date de la prochaine session"
              className="flex-1 border-[var(--border-color)] text-sm [color-scheme:dark]"
            />
            <Button
              size="icon"
              onClick={() => void handleAdd()}
              disabled={!newDate || adding}
              aria-label="Ajouter la session"
              className="bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)]"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
