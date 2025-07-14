"use client";

import { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from '@/lib/firebase';
import { Trophy, Shield, Wand2, Target, Users, Crown, Star, Sword, Heart, Zap } from 'lucide-react';
import CharacterImage from '@/components/CharacterImage';

interface Character {
  id: string;
  Nomperso: string;
  niveau?: number;
  Profile?: string;
  Race?: string;
  imageURL?: string;
  PV?: number;
  PV_Max?: number;
  Defense?: number;
  Contact?: number;
  Magie?: number;
  Distance?: number;
  INIT?: number;
  FOR?: number;
  DEX?: number;
  CON?: number;
  SAG?: number;
  INT?: number;
  CHA?: number;
  type?: string;
}

interface StatOption {
  key: keyof Character;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export function Statistiques() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStat, setSelectedStat] = useState<keyof Character>('FOR');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("Veuillez vous connecter pour voir les statistiques");
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          setError("Données utilisateur non trouvées");
          setLoading(false);
          return;
        }

        const userData = userDoc.data();
        const roomIdValue = String(userData?.room_id);

        const charactersCollection = collection(db, `cartes/${roomIdValue}/characters`);
        const playerCharactersQuery = query(charactersCollection, where("type", "==", "joueurs"));
        const charactersSnapshot = await getDocs(playerCharactersQuery);
        
        const charactersData = charactersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Character[];
        
        setCharacters(charactersData);
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const statOptions: StatOption[] = [
    { key: 'FOR', label: 'Force', icon: <Crown size={16} />, color: '#ef4444' },
    { key: 'DEX', label: 'Dextérité', icon: <Target size={16} />, color: '#22c55e' },
    { key: 'CON', label: 'Constitution', icon: <Shield size={16} />, color: '#3b82f6' },
    { key: 'INT', label: 'Intelligence', icon: <Star size={16} />, color: '#a855f7' },
    { key: 'SAG', label: 'Sagesse', icon: <Trophy size={16} />, color: '#eab308' },
    { key: 'CHA', label: 'Charisme', icon: <Users size={16} />, color: '#ec4899' },
    { key: 'Defense', label: 'Défense', icon: <Shield size={16} />, color: '#06b6d4' },
    { key: 'INIT', label: 'Initiative', icon: <Zap size={16} />, color: '#f97316' },
    { key: 'Contact', label: 'Contact', icon: <Sword size={16} />, color: '#f59e0b' },
    { key: 'Distance', label: 'Distance', icon: <Target size={16} />, color: '#10b981' },
    { key: 'Magie', label: 'Magie', icon: <Wand2 size={16} />, color: '#8b5cf6' },
    { key: 'PV_Max', label: 'PV Max', icon: <Heart size={16} />, color: '#f43f5e' }
  ];

  const getCurrentStat = () => statOptions.find(stat => stat.key === selectedStat) || statOptions[0];

  const getTopCharacters = (limit: number = 5) => {
    return [...characters]
      .sort((a, b) => (b[selectedStat] as number || 0) - (a[selectedStat] as number || 0))
      .slice(0, limit);
  };

  const getMaxValue = () => {
    return Math.max(...characters.map(char => char[selectedStat] as number || 0));
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
        Chargement des statistiques...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
        <div className="bg-red-500/10 text-red-500 p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  const currentStat = getCurrentStat();
  const topCharacters = getTopCharacters(5);
  const maxValue = getMaxValue();

  return (
    <div className="h-full bg-[#1c1c1c] text-[#d4d4d4] p-3">
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold text-[#c0a0a0] mb-1 flex items-center justify-center gap-2">
            <Trophy className="text-yellow-500" size={20} />
            Classements
          </h1>
          <p className="text-xs text-[#a0a0a0]">Sélectionnez une statistique</p>
        </div>

        {/* Sélecteur de statistique - Grid compact */}
        <div className="bg-[#242424] rounded-lg p-2 border border-[#3a3a3a]">
          <div className="grid grid-cols-3 gap-1">
            {statOptions.map((stat) => (
              <button
                key={stat.key}
                onClick={() => setSelectedStat(stat.key)}
                className={`p-2 rounded text-xs font-medium transition-all duration-200 flex flex-col items-center gap-1 ${
                  selectedStat === stat.key
                    ? 'bg-[#3a3a3a] border border-[#4a4a4a] transform scale-105'
                    : 'bg-[#2a2a2a] hover:bg-[#333333] border border-transparent'
                }`}
              >
                <div style={{ color: selectedStat === stat.key ? stat.color : '#a0a0a0' }}>
                  {stat.icon}
                </div>
                <span className={`truncate ${selectedStat === stat.key ? 'text-[#d4d4d4]' : 'text-[#a0a0a0]'}`}>
                  {stat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Affichage du classement actuel */}
        <div className="bg-[#242424] rounded-lg p-3 border border-[#3a3a3a]">
          <div className="flex items-center gap-2 mb-3">
            <div style={{ color: currentStat.color }}>
              {currentStat.icon}
            </div>
            <h3 className="text-sm font-bold text-[#c0a0a0]">Top {currentStat.label}</h3>
          </div>
          
          <div className="space-y-2">
            {topCharacters.length > 0 ? (
              topCharacters.map((char, index) => {
                const value = char[selectedStat] as number || 0;
                const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
                
                return (
                  <div key={char.id} className="relative bg-[#2a2a2a] rounded-lg p-2 border border-[#3a3a3a] overflow-hidden">
                    {/* Barre de progression visuelle */}
                    <div 
                      className="absolute inset-0 transition-all duration-500"
                      style={{ 
                        backgroundColor: currentStat.color,
                        opacity: 0.2,
                        width: `${percentage}%` 
                      }}
                    />
                    
                    <div className="relative flex items-center gap-2">
                      {/* Position */}
                      <div className={`text-lg font-bold w-6 text-center ${
                        index === 0 ? 'text-yellow-500' : 
                        index === 1 ? 'text-gray-400' : 
                        index === 2 ? 'text-amber-600' : 'text-[#a0a0a0]'
                      }`}>
                        {index + 1}
                      </div>
                      
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#3a3a3a] flex-shrink-0">
                        <CharacterImage 
                          imageUrl={char.imageURL} 
                          altText={char.Nomperso}
                          characterId={char.id}
                        />
                      </div>
                      
                      {/* Infos personnage */}
                      <div className="flex-grow min-w-0">
                        <div className="text-sm font-semibold text-[#d4d4d4] truncate">{char.Nomperso}</div>
                        <div className="text-xs text-[#a0a0a0] truncate">
                          {char.Race} {char.Profile}
                        </div>
                      </div>
                      
                      {/* Valeur */}
                      <div className="text-xl font-bold min-w-[3rem] text-right" style={{ color: currentStat.color }}>
                        {value}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-[#a0a0a0] py-4 text-sm">
                Aucun personnage trouvé
              </div>
            )}
          </div>
        </div>

        {/* Statistiques rapides */}
        {topCharacters.length > 0 && (
          <div className="bg-[#242424] rounded-lg p-3 border border-[#3a3a3a]">
            <h4 className="text-sm font-bold text-[#c0a0a0] mb-2">Stats Rapides</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#2a2a2a] p-2 rounded border border-[#3a3a3a] text-center">
                <div className="text-lg font-bold" style={{ color: currentStat.color }}>
                  {Math.max(...characters.map(char => char[selectedStat] as number || 0))}
                </div>
                <div className="text-[#a0a0a0]">Maximum</div>
              </div>
              <div className="bg-[#2a2a2a] p-2 rounded border border-[#3a3a3a] text-center">
                <div className="text-lg font-bold" style={{ color: currentStat.color }}>
                  {characters.length > 0 ? Math.round(characters.reduce((sum, char) => sum + (char[selectedStat] as number || 0), 0) / characters.length) : 0}
                </div>
                <div className="text-[#a0a0a0]">Moyenne</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}