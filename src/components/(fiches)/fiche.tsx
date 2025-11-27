"use client";

import React, { useState, useEffect } from 'react';
import {
  auth,
  db,
  doc,
  getDoc,
  updateDoc
} from '@/lib/firebase';
import { Heart, Shield, Edit, TrendingUp } from 'lucide-react';
import InventoryManagement2 from '@/components/(inventaire)/inventaire2';
import CompetencesDisplay from "@/components/(competences)/competencesD";
import Competences from "@/components/(competences)/competences";
import CharacterImage from '@/components/(fiches)/CharacterImage';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCharacter, Character } from '@/contexts/CharacterContext';

interface UserData {
  persoId?: string;
  perso?: string;
}

export default function Component() {
  const {
    characters,
    selectedCharacter,
    setSelectedCharacter,
    bonuses,
    categorizedBonuses,
    getModifier,
    getDisplayModifier,
    getDisplayValue,
    updateCharacter,
    isLoading,
    roomId,
  } = useCharacter();

  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);
  const [rollResult, setRollResult] = useState<number | null>(null);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [selectedRaceAbilities, setSelectedRaceAbilities] = useState<string[]>([]);
  const [userPersoId, setUserPersoId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showLevelUpConfirmationModal, setShowLevelUpConfirmationModal] = useState<boolean>(false);
  const [showCompetencesFullscreen, setShowCompetencesFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const loadUserData = async () => {
      const user = auth.currentUser;
      if (!user) {
        setError("Veuillez vous connecter pour voir les personnages");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserData;
          setUserPersoId(userData?.persoId || null);
          setUserRole(userData?.perso || null);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des données utilisateur:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      }
    };

    loadUserData();
  }, []);

  const handleEdit = () => {
    if (!selectedCharacter) return;
    setEditForm({
      PV: selectedCharacter.PV || 0,
      PV_Max: selectedCharacter.PV_Max || 0,
      Defense: selectedCharacter.Defense || 0,
      Contact: selectedCharacter.Contact || 0,
      Magie: selectedCharacter.Magie || 0,
      Distance: selectedCharacter.Distance || 0,
      INIT: selectedCharacter.INIT || 0,
      FOR: selectedCharacter.FOR || 0,
      DEX: selectedCharacter.DEX || 0,
      CON: selectedCharacter.CON || 0,
      SAG: selectedCharacter.SAG || 0,
      INT: selectedCharacter.INT || 0,
      CHA: selectedCharacter.CHA || 0,
    });
    setIsEditing(true);
  };

  interface RaceAbilitiesModalProps {
    abilities: string[];
    onClose: () => void;
  }
  
  const RaceAbilitiesModal: React.FC<RaceAbilitiesModalProps> = ({ abilities, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-bold text-[#c0a080] mb-4">Capacités Raciales</h2>
        <div className="space-y-3 sm:space-y-4">
          {abilities.map((ability, index) => (
            <p key={index} className="text-sm sm:text-base text-[#d4d4d4]">{ability}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold mt-4"
        >
          Fermer
        </button>
      </div>
    </div>
  );

  const handleRaceClick = async (race: string) => {
    console.log(race);
    if (!race) {
      setSelectedRaceAbilities(["Race non spécifiée."]);
      setIsRaceModalOpen(true);
      return;
    }
  
    try {
      const response = await fetch('/tabs/capacites.json');
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des capacités.");
      }
  
      const abilitiesData: Record<string, string[]> = await response.json();
      const abilities = abilitiesData[race.toLowerCase()] 
          ? Object.values(abilitiesData[race.toLowerCase()]) 
          : ["Aucune capacité raciale trouvée."];
      
      setSelectedRaceAbilities(abilities);
      
      setIsRaceModalOpen(true);
    } catch (error) {
      console.error("Erreur lors du chargement des capacités:", error);
      setSelectedRaceAbilities(["Erreur lors du chargement des capacités."]);
      setIsRaceModalOpen(true);
    }
  };

  const handleSave = async () => {
    if (!selectedCharacter) return;
    try {
      await updateCharacter(selectedCharacter.id, editForm);
      
      setIsEditing(false);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde des modifications");
    }
  };

  const openLevelUpModal = () => {
    setShowLevelUpModal(true);
    setRollResult(null);
  };

  const handleRollDie = () => {
    if (!selectedCharacter) return;
    const deVie = selectedCharacter.deVie || 'd8';
    const faces = parseInt(deVie.substring(1));
    const roll = Math.floor(Math.random() * faces) + 1;
    const conModifier = getModifier(selectedCharacter.CON || 0);
    setRollResult(roll + conModifier);
  };

  const LevelUpConfirmationModal: React.FC<{ onClose: () => void; updatedCharacter: Character }> = ({ onClose, updatedCharacter }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-[#c0a0a0] mb-4">Niveau Augmenté !</h2>
        <p className="text-sm sm:text-base text-[#d4d4d4] mb-4">
          Félicitations, votre personnage a monté de niveau ! Voici les nouvelles valeurs :
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm text-[#a0a0a0] mb-4">
          <div>PV Max: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.PV_Max}</span></div>
          <div>Contact: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Contact}</span></div>
          <div>Distance: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Distance}</span></div>
          <div>Magie: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Magie}</span></div>
        </div>
        <button
          onClick={onClose}
          className="bg-[#5c6bc0] text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-xs sm:text-sm font-bold"
        >
          Fermer
        </button>
      </div>
    </div>
  );
  
  const confirmLevelUp = async () => {
    if (rollResult == null || !selectedCharacter) {
      alert("Veuillez lancer le dé avant de valider.");
      return;
    }
  
    const newPV_Max = (parseInt(selectedCharacter.PV_Max as any) || 0) + rollResult;
    const updates = {
      PV_Max: newPV_Max,
      PV: newPV_Max, 
      Contact: (parseInt(selectedCharacter.Contact as any) || 0) + 1,
      Distance: (parseInt(selectedCharacter.Distance as any) || 0) + 1,
      Magie: (parseInt(selectedCharacter.Magie as any) || 0) + 1,
      niveau: (selectedCharacter.niveau || 0) + 1,
    };
  
    try {
      await updateCharacter(selectedCharacter.id, updates);
      
      setShowLevelUpModal(false);
      setShowLevelUpConfirmationModal(true);
    } catch (error) {
      console.error("Erreur lors de l'augmentation de niveau:", error);
      alert("Erreur lors de l'augmentation de niveau");
    }
  };
  
  const closeLevelUpModal = () => {
    setShowLevelUpModal(false);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      Chargement...
    </div>;
  }

  if (error) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      <div className="bg-red-500/10 text-red-500 p-4 rounded-lg">
        {error}
      </div>
    </div>;
  }

  // Si le gestionnaire de compétences plein écran est ouvert, l'afficher
  if (showCompetencesFullscreen && selectedCharacter) {
    return (
      <Competences
        preSelectedCharacterId={selectedCharacter.id}
        onClose={() => setShowCompetencesFullscreen(false)}
      />
    );
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-2 sm:p-4">
      <div className="max-w-7xl mx-auto bg-[#242424] rounded-lg shadow-2xl p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
        
        {/* Boutons discrets en haut à gauche */}
        {selectedCharacter && (selectedCharacter.id === userPersoId || userRole === "MJ") && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleEdit}
              className="bg-[#3a3a3a] text-[#c0a080] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1 text-xs sm:text-sm"
              title="Modifier"
            >
              <Edit size={16} />
              <span>Modifier</span>
            </button>
            <button
              onClick={openLevelUpModal}
              className="bg-[#3a3a3a] text-[#5c6bc0] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1 text-xs sm:text-sm"
              title="Monter de niveau"
            >
              <TrendingUp size={16} />
              <span>Niveau +</span>
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[#3a3a3a] scrollbar-track-transparent">
          {characters.map((character) => (
            <button
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              className={`px-3 py-2 sm:px-4 ${
                selectedCharacter?.id === character.id 
                  ? 'bg-[#d4b48f]' 
                  : 'bg-[#c0a080]'
              } text-[#1c1c1c] rounded-lg hover:bg-[#d4b48f] transition whitespace-nowrap text-xs sm:text-sm font-bold flex-shrink-0`}
            >
              {character.Nomperso}
            </button>
          ))}
        </div>

        {selectedCharacter && !isEditing && (
          <>
            {/* Layout principal avec responsive mobile -> tablette -> desktop */}
            <div className="flex flex-col xl:flex-row gap-4 md:gap-6">
              {/* Colonne gauche: Infos du personnage + Inventaire */}
              <div className="flex-1 space-y-4 md:space-y-6">
                {/* Image et infos principales */}
                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 md:space-x-6">
                  <div className="flex-shrink-0 mx-auto sm:mx-0">
                    <CharacterImage
                      imageUrl={selectedCharacter.imageURL}
                      altText={selectedCharacter.Nomperso}
                      characterId={selectedCharacter.id}
                    />
                  </div>

                  <div className="flex-grow space-y-3 md:space-y-4">
                    <div className="bg-[#2a2a2a] p-3 md:p-4 rounded-lg border border-[#3a3a3a]">
                      <h2 className="text-xl md:text-2xl font-bold text-[#c0a0a0] mb-2 text-center sm:text-left">{selectedCharacter.Nomperso}</h2>
                      <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs sm:text-sm">
                        <div>Niveau: <span className="text-[#a0a0a0]">{selectedCharacter.niveau}</span></div>
                        <div>Initiative: <span className="text-[#a0a0a0]">{getDisplayValue("INIT")}</span></div>
                        <div>Profil: <span className="text-[#a0a0a0]">{selectedCharacter.Profile}</span></div>
                        <div>Taille: <span className="text-[#a0a0a0]">{selectedCharacter.Taille} cm</span></div>
                        <div>
      Race:
      <span
        className="text-[#a0a0a0] underline cursor-pointer"
        onClick={() => handleRaceClick(selectedCharacter.Race || "")}
      >
        {selectedCharacter.Race}
      </span>
    </div>
    <div>Poids: <span className="text-[#a0a0a0]">{selectedCharacter.Poids} Kg</span></div>
    <div className="xs:col-span-2">Dé de Vie: <span className="text-[#a0a0a0]">{selectedCharacter.deVie}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats sur toute la largeur en dessous - 2 lignes de 3 */}
                <div className="grid grid-cols-3 gap-3 md:gap-4 text-center">
                  {[
                    { name: 'FOR', value: getDisplayModifier("FOR") },
                    { name: 'DEX', value: getDisplayModifier("DEX") },
                    { name: 'CON', value: getDisplayModifier("CON") },
                    { name: 'INT', value: getDisplayModifier("INT") },
                    { name: 'SAG', value: getDisplayModifier("SAG") },
                    { name: 'CHA', value: getDisplayModifier("CHA") },
                  ].map((ability) => (
                    <Tooltip key={ability.name}>
                    <TooltipTrigger>
                      <div className="bg-[#2a2a2a] p-3 sm:p-4 md:p-5 rounded-lg border border-[#3a3a3a]">
                        <div className="text-[#c0a0a0] font-semibold text-sm sm:text-base">{ability.name}</div>
                        <div className={`text-xl sm:text-2xl md:text-3xl font-bold leading-tight ${ability.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {ability.value >= 0 ? '+' : ''}{ability.value}
                        </div>
                        <div className="text-xs sm:text-sm text-[#a0a0a0]">{selectedCharacter ? selectedCharacter[ability.name as keyof Character] : 0}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mod de base: {getModifier(selectedCharacter ? selectedCharacter[ability.name as keyof Character] as number : 0)}</p>
                      <p>Inventaire: {categorizedBonuses ? categorizedBonuses[ability.name].Inventaire : 0}</p>
                      <p>Compétence: {categorizedBonuses ? categorizedBonuses[ability.name].Competence : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                  ))}
                </div>

                <div className="bg-[#2a2a2a] p-2 xs:p-3 sm:p-4 rounded-lg border border-[#3a3a3a] flex flex-col xs:flex-row justify-between items-center gap-2 xs:gap-3">
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center space-x-1.5 xs:space-x-2">
                        <Heart className="text-red-500" size={18} />
                        <span className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-[#d4d4d4]">
                          {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Base: {selectedCharacter ? selectedCharacter.PV : 0}</p>
                      <p>Inventaire: {categorizedBonuses ? categorizedBonuses.PV.Inventaire : 0}</p>
                      <p>Compétence: {categorizedBonuses ? categorizedBonuses.PV.Competence : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center space-x-1.5 xs:space-x-2">
                        <Shield className="text-blue-500" size={18} />
                        <span className="text-base xs:text-lg sm:text-xl md:text-2xl font-bold text-[#d4d4d4]">{getDisplayValue("Defense")}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Base: {selectedCharacter ? selectedCharacter.Defense : 0}</p>
                      <p>Inventaire: {categorizedBonuses ? categorizedBonuses.Defense.Inventaire : 0}</p>
                      <p>Compétence: {categorizedBonuses ? categorizedBonuses.Defense.Competence : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  {[
                    { name: 'Contact', value: getDisplayValue("Contact") },
                    { name: 'Distance', value: getDisplayValue("Distance") },
                    { name: 'Magie', value: getDisplayValue("Magie") }
                  ].map((stat) => (
                    <Tooltip key={stat.name}>
                      <TooltipTrigger>
                        <div className="bg-[#2a2a2a] p-2 xs:p-3 sm:p-4 rounded-lg border border-[#3a3a3a] text-center">
                          <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-[#c0a0a0] mb-0.5 sm:mb-1">{stat.name}</h3>
                          <span className="text-lg xs:text-xl sm:text-2xl font-bold text-[#d4d4d4]">{stat.value}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Base: {selectedCharacter ? selectedCharacter[stat.name as keyof Character] : 0}</p>
                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses[stat.name].Inventaire : 0}</p>
                        <p>Compétence: {categorizedBonuses ? categorizedBonuses[stat.name].Competence : 0}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>

                {/* Inventaire dans la colonne gauche */}
                {(selectedCharacter.id === userPersoId || userRole === "MJ") && roomId && (
                  <InventoryManagement2 playerName={selectedCharacter.Nomperso} roomId={roomId} />
                )}
              </div>

              {/* Colonne droite: Compétences - Visible pour tous, modifiable selon les droits */}
              {roomId && (
                <div className="w-full xl:w-[600px] flex-shrink-0">
                  <CompetencesDisplay
                    roomId={roomId}
                    characterId={selectedCharacter.id}
                    canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
                    onOpenFullscreen={() => setShowCompetencesFullscreen(true)}
                  />
                </div>
              )}
            </div>
          </>
        )}

{showLevelUpConfirmationModal && selectedCharacter && (
  <LevelUpConfirmationModal 
    onClose={() => setShowLevelUpConfirmationModal(false)} 
    updatedCharacter={selectedCharacter} 
  />
)}

        {isEditing && (
          <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-lg border border-[#3a3a3a]">
            <h2 className="text-lg sm:text-xl font-bold text-[#c0a0a0] mb-4">
  Modifier {selectedCharacter?.Nomperso || "Personnage"}
</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">PV</label>
                <input
                  type="number"
                  value={editForm.PV || ''}
                  onChange={(e) => setEditForm({...editForm, PV: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">PV Maximum</label>
                <input
                  type="number"
                  value={editForm.PV_Max || ''}
                  onChange={(e) => setEditForm({...editForm, PV_Max: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">Défense</label>
                <input
                  type="number"
                  value={editForm.Defense || ''}
                  onChange={(e) => setEditForm({...editForm, Defense: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">Contact</label>
                <input
                  type="number"
                  value={editForm.Contact || ''}
                  onChange={(e) => setEditForm({...editForm, Contact: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">Magie</label>
                <input
                  type="number"
                  value={editForm.Magie || ''}
                  onChange={(e) => setEditForm({...editForm, Magie: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">Distance</label>
                <input
                  type="number"
                  value={editForm.Distance || ''}
                  onChange={(e) => setEditForm({...editForm, Distance: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm block">Initiative</label>
                <input
                  type="number"
                  value={editForm.INIT || ''}
                  onChange={(e) => setEditForm({...editForm, INIT: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
              {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((stat) => (
                <div key={stat} className="space-y-2">
                  <label className="text-xs sm:text-sm block">{stat}</label>
                  <input
                    type="number"
                    value={editForm[stat as keyof Character] || ''}
                    onChange={(e) => setEditForm({...editForm, [stat]: parseInt(e.target.value)})}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col xs:flex-row justify-end gap-3 xs:gap-4">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="bg-[#c0a080] text-[#1c1c1c] px-4 sm:px-6 py-2 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-xs sm:text-sm font-bold"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        )}
          {isRaceModalOpen && (
    <RaceAbilitiesModal 
      abilities={selectedRaceAbilities} 
      onClose={() => setIsRaceModalOpen(false)} 
    />
  )}

        {showLevelUpModal && selectedCharacter && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
              <h2 className="text-lg sm:text-xl font-bold text-[#c0a0a0] mb-4">Monter de Niveau</h2>
              <p className="text-sm sm:text-base text-[#d4d4d4] mb-4">Lancez un dé pour augmenter les PV Max.</p>
              <button
                onClick={handleRollDie}
                className="bg-[#c0a080] text-[#1c1c1c] px-4 py-2 rounded-lg mb-4 hover:bg-[#d4b48f] transition duration-300 text-xs sm:text-sm font-bold"
              >
                Lancer le Dé
              </button>
              {rollResult !== null && selectedCharacter && (
                <div className="text-lg sm:text-2xl font-bold text-green-500 mb-4 break-words">
                  {rollResult - getModifier(selectedCharacter.CON || 0)} + CON ({getModifier(selectedCharacter.CON || 0)}) = {rollResult}
                </div>
              )}
              <div className="flex flex-col xs:flex-row justify-center gap-3 xs:gap-4">
                <button
                  onClick={confirmLevelUp}
                  className="bg-[#5c6bc0] text-white px-4 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-xs sm:text-sm font-bold"
                >
                  Valider
                </button>
                <button
                  onClick={closeLevelUpModal}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </TooltipProvider>
  );
}
