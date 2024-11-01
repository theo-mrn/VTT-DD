'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, onAuthStateChanged, doc, getDoc } from '@/lib/firebase';

export default function LandingPage() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const router = useRouter();

  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);

  // Fonction pour vérifier les données de l'utilisateur et rediriger
  const checkUserDataAndRedirect = async () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = doc(db, 'users', user.uid);
        const userSnapshot = await getDoc(userDoc);
        if (userSnapshot.exists()) {
          const { room_id, perso } = userSnapshot.data();
          if (!room_id) {
            router.push('/pages/Salle.html');
          } else if (!perso) {
            router.push('/pages/personnages.html');
          } else {
            router.push('/map');
          }
        }
      } else {
        router.push('/auth'); 
      }
    });
  };

  return (
    <div className="text-gray-800">
      <header className="fixed top-0 left-0 w-full bg-black bg-opacity-80 z-50">
        <nav className="flex items-center justify-between p-4 max-w-7xl mx-auto">
          <div className="text-white text-2xl font-bold uppercase">D&D Aventures</div>
          <div className="md:hidden cursor-pointer" onClick={toggleMobileNav}>
            <div className="w-6 h-0.5 bg-white mb-1"></div>
            <div className="w-6 h-0.5 bg-white mb-1"></div>
            <div className="w-6 h-0.5 bg-white"></div>
          </div>
          <div className="hidden md:flex space-x-6">
            <button
              onClick={() => router.push('/auth')}
              className="text-white hover:text-red-500"
            >
              Se connecter / S'inscrire
            </button>
          </div>
        </nav>
        {isMobileNavOpen && (
          <div className="bg-black bg-opacity-90 absolute w-full flex flex-col items-center md:hidden">
            <button
              onClick={() => {
                router.push('/auth');
                setIsMobileNavOpen(false);
              }}
              className="text-white py-2"
            >
              Se connecter / S'inscrire
            </button>
          </div>
        )}
      </header>

      <main>
        <section className="h-screen bg-cover bg-center flex items-center justify-start text-white relative" style={{ backgroundImage: "url('/images/index1.webp')" }}>
          <div className="bg-black bg-opacity-50 absolute inset-0"></div>
          <div className="relative z-10 p-10 max-w-lg">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Plongez dans l'Univers Épique de D&D</h1>
            <p className="text-lg md:text-xl mb-6">Forgez votre légende, affrontez des monstres redoutables et vivez des aventures inoubliables dans le monde fantastique de Donjons & Dragons.</p>
            <button
              onClick={checkUserDataAndRedirect} // Appelle la fonction de vérification au clic
              className="inline-block bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-transform transform hover:-translate-y-1"
              id="start-button"
            >
              Commencer l'Aventure
            </button>
          </div>
        </section>

        <section className="py-16 bg-gray-100 text-center">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12">Caractéristiques du Jeu</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-lg shadow-md transition-transform transform hover:-translate-y-2">
                <h3 className="text-xl font-semibold mb-4 text-red-500">Combats Épiques</h3>
                <p>Affrontez des créatures légendaires et des ennemis redoutables dans des combats tactiques palpitants.</p>
              </div>
              <div className="bg-white p-8 rounded-lg shadow-md transition-transform transform hover:-translate-y-2">
                <h3 className="text-xl font-semibold mb-4 text-red-500">Jeu Coopératif</h3>
                <p>Formez une équipe soudée avec vos amis et relevez ensemble ou mettez vous sur la gueule.</p>
              </div>
              <div className="bg-white p-8 rounded-lg shadow-md transition-transform transform hover:-translate-y-2">
                <h3 className="text-xl font-semibold mb-4 text-red-500">Fiche de personnages</h3>
                <p>Créez vos fiches de personnage interactif.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-white text-center">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12">Galerie d'Aventures</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative overflow-hidden rounded-lg h-80">
                <img src="/images/foret.webp" className="w-full h-full object-cover transform transition-transform hover:scale-110" />
              </div>
              <div className="relative overflow-hidden rounded-lg h-80">
                <img src="/images/carte.webp" className="w-full h-full object-cover transform transition-transform hover:scale-110" />
              </div>
              <div className="relative overflow-hidden rounded-lg h-80">
                <img src="/images/prison.webp" className="w-full h-full object-cover transform transition-transform hover:scale-110" />
              </div>
            </div>
          </div>
        </section>

        <section className="py-32 bg-cover bg-center text-center text-white relative" style={{ backgroundImage: "url('/images/index2.webp')" }}>
          <div className="bg-black bg-opacity-60 absolute inset-0"></div>
          <div className="relative z-10 max-w-3xl mx-auto px-4">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Prêt à Commencer Votre Quête ?</h2>
            <p className="text-lg md:text-xl mb-8">Rejoignez des millions d'aventuriers dans le monde fascinant de Donjons & Dragons. Votre légende vous attend !</p>
            <button
              onClick={checkUserDataAndRedirect} // Appelle la fonction de vérification au clic
              className="inline-block bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-transform transform hover:-translate-y-1"
              id="create-character-button"
            >
              Créer un Personnage
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
