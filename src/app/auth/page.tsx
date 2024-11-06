'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'

export default function AuthForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('') // Nouvel état pour le nom d'utilisateur
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent, action: 'signup' | 'login') => {
    event.preventDefault()
    setError(null) // Réinitialiser l'erreur

    try {
      if (action === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        const user = userCredential.user
        // Stocker le nom d'utilisateur et le titre dans Firestore
        await setDoc(doc(db, "users", user.uid), {
          name: username,
          title: "débutant"
        })
        router.push('/Salle') // Rediriger vers la page d'accueil
      } else if (action === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
        router.push('/Salle') // Rediriger vers la page d'accueil
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">Authentification</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
              <TabsTrigger value="signup" className="text-base h-full data-[state=active]:bg-background">Inscription</TabsTrigger>
              <TabsTrigger value="login" className="text-base h-full data-[state=active]:bg-background">Connexion</TabsTrigger>
            </TabsList>

            {error && <p className="text-red-500 text-center">{error}</p>}  {/* Affichage de l'erreur */}

            <TabsContent value="signup">
              <form onSubmit={(e) => handleSubmit(e, 'signup')} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="signup-username" className="text-base">Nom d'utilisateur</Label>
                  <Input 
                    id="signup-username" 
                    type="text" 
                    placeholder="Nom d'utilisateur" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required 
                    className="text-base py-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-base">Email</Label>
                  <Input 
                    id="signup-email" 
                    type="email" 
                    placeholder="votre@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                    className="text-base py-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-base">Mot de passe</Label>
                  <Input 
                    id="signup-password" 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                    className="text-base py-2"
                  />
                </div>
                <Button type="submit" className="w-full text-base py-2">S&apos;inscrire</Button>
              </form>
            </TabsContent>

            <TabsContent value="login">
              <form onSubmit={(e) => handleSubmit(e, 'login')} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-base">Email</Label>
                  <Input 
                    id="login-email" 
                    type="email" 
                    placeholder="votre@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                    className="text-base py-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-base">Mot de passe</Label>
                  <Input 
                    id="login-password" 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                    className="text-base py-2"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <Button type="submit" className="w-1/2 text-base py-2">Se connecter</Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
