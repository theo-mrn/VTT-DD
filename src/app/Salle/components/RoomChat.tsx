'use client'

import { useState, useEffect, useRef } from 'react'
import { auth, db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc, deleteDoc, limitToLast } from '@/lib/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, Send, Trash2 } from 'lucide-react'

interface ChatMessage {
  id: string
  uid: string
  senderName: string
  senderPp?: string
  text: string
  timestamp: any
}

export function RoomChat({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [userCache, setUserCache] = useState<Record<string, { name: string; pp: string }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch messages in real-time
  useEffect(() => {
    const q = query(
      collection(db, `Salle/${roomId}/chat`),
      orderBy('timestamp', 'asc'),
      limitToLast(50)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = []
      snapshot.forEach((d) => {
        const data = d.data()
        if (data.text) {
          msgs.push({ id: d.id, ...data } as ChatMessage)
        }
      })
      setMessages(msgs)
    })
    return () => unsubscribe()
  }, [roomId])

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Resolve user info for display
  const resolveUser = async (uid: string): Promise<{ name: string; pp: string }> => {
    if (userCache[uid]) return userCache[uid]
    const userDoc = await getDoc(doc(db, 'users', uid))
    const info = userDoc.exists()
      ? (userDoc.data() as { name: string; pp: string })
      : { name: 'Inconnu', pp: '' }
    setUserCache((prev) => ({ ...prev, [uid]: info }))
    return info
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = auth.currentUser
    if (!user || !newMessage.trim()) return

    const info = await resolveUser(user.uid)

    await addDoc(collection(db, `Salle/${roomId}/chat`), {
      uid: user.uid,
      senderName: info.name,
      senderPp: info.pp || '',
      text: newMessage.trim(),
      timestamp: serverTimestamp(),
    })
    setNewMessage('')
  }

  const handleDelete = async (msgId: string) => {
    await deleteDoc(doc(db, `Salle/${roomId}/chat`, msgId))
  }

  const currentUid = auth.currentUser?.uid

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Discussion
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Messages list */}
        <div className="max-h-80 overflow-y-auto px-6 py-2">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aucun message pour le moment. Lancez la discussion !
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => {
                const isMe = msg.uid === currentUid

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    {msg.senderPp ? (
                      <img
                        src={msg.senderPp}
                        alt={msg.senderName}
                        className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border flex-shrink-0">
                        <span className="text-xs font-bold text-muted-foreground">
                          {msg.senderName?.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div className={`group flex flex-col gap-0.5 max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-semibold text-foreground">
                          {isMe ? 'Vous' : msg.senderName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {msg.timestamp?.toDate
                            ? new Date(msg.timestamp.toDate()).toLocaleString([], {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '...'}
                        </span>
                      </div>
                      <div className="relative">
                        <div
                          className={`px-3 py-2 rounded-xl text-sm ${
                            isMe
                              ? 'bg-primary text-primary-foreground rounded-tr-sm'
                              : 'bg-muted text-foreground rounded-tl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                        {/* Delete button for own messages or room owner */}
                        {(isMe || isOwner) && (
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Compose bar */}
        {currentUid ? (
          <form onSubmit={handleSend} className="flex items-center gap-2 px-6 py-3 border-t border-border">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Écrire un message..."
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div className="px-6 py-3 border-t border-border text-center text-sm text-muted-foreground">
            Connectez-vous pour participer à la discussion.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
