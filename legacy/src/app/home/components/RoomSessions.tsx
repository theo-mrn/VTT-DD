'use client'

import { useState, useEffect } from 'react'
import { db, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, Timestamp } from '@/lib/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Session {
  id: string
  date: Date
}

export function RoomSessions({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [newDate, setNewDate] = useState('')

  useEffect(() => {
    const q = query(
      collection(db, `Salle/${roomId}/sessions`),
      orderBy('date', 'asc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date()
      const list: Session[] = []
      snapshot.forEach((d) => {
        const data = d.data()
        const date = data.date?.toDate?.() ?? new Date(data.date)
        if (date > now) {
          list.push({ id: d.id, date })
        }
      })
      setSessions(list)
    })
    return () => unsubscribe()
  }, [roomId])

  const handleAdd = async () => {
    if (!newDate) return
    const date = new Date(newDate)
    if (isNaN(date.getTime())) return

    await addDoc(collection(db, `Salle/${roomId}/sessions`), {
      date: Timestamp.fromDate(date),
    })
    setNewDate('')
  }

  const handleDelete = async (sessionId: string) => {
    await deleteDoc(doc(db, `Salle/${roomId}/sessions`, sessionId))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Prochaines sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Session list */}
        {sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 group"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium capitalize">
                    {format(session.date, "EEEE d MMMM", { locale: fr })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(session.date, "HH:mm")}
                  </span>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleDelete(session.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            Aucune session prévue
          </p>
        )}

        {/* Add session (MJ only) */}
        {isOwner && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button size="icon" onClick={handleAdd} disabled={!newDate}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
