'use client';

/**
 * Discussion de la campagne, reprise de l'ancienne app (CampaignChat). Les messages
 * sont relus toutes les quelques secondes en attendant le service temps réel.
 */
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { deleteMessage, listMessages, sendMessage, type CampaignMessage } from '@/lib/campaigns';
import { useSession } from '@/lib/session';

const POLL_MS = 5000;
const MAX_LENGTH = 1000;

function formatStamp(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '...'
    : d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function CampaignChat({ campaignId, isOwner }: { campaignId: string; isOwner: boolean }) {
  const { profile } = useSession();
  const currentUid = profile?.id.toLowerCase();
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMessages(await listMessages(campaignId));
    } catch {
      // Relu au prochain passage
    }
  }, [campaignId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Défile vers le bas quand un nouveau message arrive (dans la liste seulement, pas la page)
  useEffect(() => {
    const last = messages.at(-1)?.id ?? null;
    if (last && last !== lastId.current && listRef.current)
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    lastId.current = last;
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendMessage(campaignId, text);
      setNewMessage('');
      if (m?.id) setMessages((list) => [...list.filter((x) => x.id !== m.id), m]);
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    setMessages((list) => list.filter((m) => m.id !== id));
    try {
      await deleteMessage(campaignId, id);
    } catch (err) {
      setError(errorMessage(err));
      void refresh();
    }
  }

  return (
    <Card className="border-none bg-transparent text-[var(--text-primary)] ring-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Discussion
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={listRef} className="max-h-80 overflow-y-auto px-4 py-2 sm:px-6">
          {messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aucun message pour le moment. Lancez la discussion !
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => {
                const isMe = msg.author.id.toLowerCase() === currentUid;
                const name = msg.author.name ?? 'Inconnu';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {msg.author.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={msg.author.avatarUrl}
                        alt={name}
                        className="h-8 w-8 flex-shrink-0 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                        <span className="text-xs font-bold text-muted-foreground">
                          {name.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div
                      className={`group flex max-w-[75%] flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-semibold text-foreground">
                          {isMe ? 'Vous' : name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatStamp(msg.createdAt)}
                        </span>
                      </div>
                      <div className="relative">
                        <div
                          className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${
                            isMe
                              ? 'bg-primary rounded-tr-sm text-primary-foreground'
                              : 'rounded-tl-sm bg-muted text-foreground'
                          }`}
                        >
                          {msg.body}
                        </div>
                        {(isMe || isOwner) && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(msg.id)}
                            aria-label="Supprimer le message"
                            className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/80 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-xs text-red-400 sm:px-6">{error}</p>}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-[var(--border-color)] px-4 py-3 sm:px-6"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrire un message..."
            maxLength={MAX_LENGTH}
            className="flex-1 border-[var(--border-color)]"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Envoyer"
            disabled={!newMessage.trim() || sending}
            className="bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
