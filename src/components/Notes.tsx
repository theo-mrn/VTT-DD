'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Pencil, Trash2, Plus } from "lucide-react"
import { db, auth, addDoc, collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc, onAuthStateChanged } from "@/lib/firebase"

interface Note {
  id: string | null
  title: string
  content: string
}

export default function MedievalNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [currentNote, setCurrentNote] = useState<Note>({ id: null, title: '', content: '' })
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [character, setCharacter] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userDocRef)

        if (userDoc.exists()) {
          const userData = userDoc.data()
          setRoomId(String(userData.room_id))
          setCharacter(String(userData.perso))
        } else {
          console.error("User data not found")
        }
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (roomId && character) {
      const notesCollectionRef = collection(db, 'Notes', roomId, character)

      const unsubscribe = onSnapshot(notesCollectionRef, (snapshot) => {
        const notesData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Note))
        setNotes(notesData)
      })

      return () => unsubscribe()
    }
  }, [roomId, character])

  const handleSaveNote = async () => {
    if (currentNote.content.trim() && roomId && character) {
      const notesCollectionRef = collection(db, 'Notes', roomId, character)

      if (currentNote.id) {
        const noteDocRef = doc(db, 'Notes', roomId, character, currentNote.id)
        await updateDoc(noteDocRef, {
          title: currentNote.title,
          content: currentNote.content
        })
      } else {
        await addDoc(notesCollectionRef, {
          title: currentNote.title,
          content: currentNote.content
        })
      }
      setIsDialogOpen(false)
      setCurrentNote({ id: null, title: '', content: '' })
    }
  }

  const handleDeleteNote = async (id: string) => {
    if (roomId && character) {
      const noteDocRef = doc(db, 'Notes', roomId, character, id)
      await deleteDoc(noteDocRef)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 min-h-screen bg-[#1c1c1c] text-white">
      <Button 
        onClick={() => {
          setCurrentNote({ id: null, title: '', content: '' })
          setIsDialogOpen(true)
        }}
        className="mb-4 bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]"
      >
        <Plus className="mr-2 h-4 w-4" /> Nouvelle Note
      </Button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notes.map(note => (
          <Card key={note.id} className="bg-[#242424] text-white border border-[#3a3a3a] shadow-lg">
            <CardHeader>
              <CardTitle className="font-semibold text-[#d4b48f]">{note.title || 'Sans titre'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-[#d4d4d4]">{note.content}</p>
            </CardContent>
            <CardFooter className="justify-end space-x-2">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => {
                  setCurrentNote(note)
                  setIsDialogOpen(true)
                }}
                className="text-[#d4b48f] border-[#3a3a3a] hover:bg-[#3a3a3a]"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button 
                variant="destructive" 
                size="icon"
                onClick={() => handleDeleteNote(note.id!)}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>{currentNote.id ? 'Modifier la note' : 'Nouvelle note'}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Titre (optionnel)"
            value={currentNote.title}
            onChange={(e) => setCurrentNote({ ...currentNote, title: e.target.value })}
            className="mb-4 bg-[#1c1c1c] text-white border-[#3a3a3a]"
          />
          <Textarea
            placeholder="Contenu de la note"
            value={currentNote.content}
            onChange={(e) => setCurrentNote({ ...currentNote, content: e.target.value })}
            rows={6}
            className="mb-4 bg-[#1c1c1c] text-white border-[#3a3a3a]"
          />
          <DialogFooter>
            <Button onClick={() => setIsDialogOpen(false)} variant="outline" className="text-[#d4d4d4] border-[#3a3a3a] hover:bg-[#3a3a3a]">
              Annuler
            </Button>
            <Button onClick={handleSaveNote} className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
