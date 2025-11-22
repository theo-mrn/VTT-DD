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
import InventoryManagement2 from '@/components/inventaire2';
import CompetencesDisplay from "@/components/competencesD";
import CharacterImage from '@/components/CharacterImage';
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-[#c0a080] mb-4">Capacités Raciales</h2>
        <div className="space-y-4">
          {abilities.map((ability, index) => (
            <p key={index} className="text-[#d4d4d4]">{ability}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold mt-4"
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-[#c0a0a0] mb-4">Niveau Augmenté !</h2>
        <p className="text-[#d4d4d4] mb-4">
          Félicitations, votre personnage a monté de niveau ! Voici les nouvelles valeurs :
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm text-[#a0a0a0] mb-4">
          <div>PV Max: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.PV_Max}</span></div>
          <div>Contact: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Contact}</span></div>
          <div>Distance: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Distance}</span></div>
          <div>Magie: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Magie}</span></div>
        </div>
        <button
          onClick={onClose}
          className="bg-[#5c6bc0] text-white px-6 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-sm font-bold"
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

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4">
      <div className="max-w-[1350px] mx-auto bg-[#242424] rounded-lg shadow-2xl p-6 space-y-6">
        
        {/* Boutons discrets en haut à gauche */}
        {selectedCharacter && (selectedCharacter.id === userPersoId || userRole === "MJ") && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleEdit}
              className="bg-[#3a3a3a] text-[#c0a080] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1"
              title="Modifier"
            >
              <Edit size={16} />
              <span className="text-xs">Modifier</span>
            </button>
            <button
              onClick={openLevelUpModal}
              className="bg-[#3a3a3a] text-[#5c6bc0] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1"
              title="Monter de niveau"
            >
              <TrendingUp size={16} />
              <span className="text-xs">Niveau +</span>
            </button>
          </div>
        )}

        <div className="flex justify-center space-x-2 overflow-x-auto">
          {characters.map((character) => (
            <button
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              className={`px-4 py-2 ${
                selectedCharacter?.id === character.id 
                  ? 'bg-[#d4b48f]' 
                  : 'bg-[#c0a080]'
              } text-[#1c1c1c] rounded-lg hover:bg-[#d4b48f] transition whitespace-nowrap text-sm font-bold`}
            >
              {character.Nomperso}
            </button>
          ))}
        </div>

        {selectedCharacter && !isEditing && (
          <>
            {/* Layout principal avec 2 colonnes: infos + inventaire à gauche, compétences à droite */}
            <div className="flex gap-6">
              {/* Colonne gauche: Infos du personnage + Inventaire */}
              <div className="flex-1 space-y-6">
                <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
                  <div className="flex-shrink-0">
                    <CharacterImage 
                      imageUrl={selectedCharacter.imageURL} 
                      altText={selectedCharacter.Nomperso} 
                      characterId={selectedCharacter.id} 
                    />
                  </div>

                  <div className="flex-grow space-y-4">
                    <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a]">
                      <h2 className="text-2xl font-bold text-[#c0a0a0] mb-2">{selectedCharacter.Nomperso}</h2>
                      <div className="grid grid-cols-2 gap-2 text-sm">
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
    <div>Dé de Vie: <span className="text-[#a0a0a0]">{selectedCharacter.deVie}</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
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
                          <div className="bg-[#2a2a2a] p-2 rounded-lg border border-[#3a3a3a]">
                            <div className="text-[#c0a0a0] font-semibold">{ability.name}</div>
                            <div className={`text-2xl font-bold ${ability.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {ability.value >= 0 ? '+' : ''}{ability.value}
                            </div>
                            <div className="text-sm text-[#a0a0a0]">{selectedCharacter ? selectedCharacter[ability.name as keyof Character] : 0}</div>
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
                  </div>
                </div>

                <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] flex justify-between items-center">
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center space-x-2">
                        <Heart className="text-red-500" size={24} />
                        <span className="text-2xl font-bold text-[#d4d4d4]">
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
                      <div className="flex items-center space-x-2">
                        <Shield className="text-blue-500" size={24} />
                        <span className="text-2xl font-bold text-[#d4d4d4]">{getDisplayValue("Defense")}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Base: {selectedCharacter ? selectedCharacter.Defense : 0}</p>
                      <p>Inventaire: {categorizedBonuses ? categorizedBonuses.Defense.Inventaire : 0}</p>
                      <p>Compétence: {categorizedBonuses ? categorizedBonuses.Defense.Competence : 0}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name: 'Contact', value: getDisplayValue("Contact") },
                    { name: 'Distance', value: getDisplayValue("Distance") },
                    { name: 'Magie', value: getDisplayValue("Magie") }
                  ].map((stat) => (
                    <Tooltip key={stat.name}>
                      <TooltipTrigger>
                        <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] text-center">
                          <h3 className="text-lg font-semibold text-[#c0a0a0] mb-1">{stat.name}</h3>
                          <span className="text-2xl font-bold text-[#d4d4d4]">{stat.value}</span>
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
                <div className="w-[600px] flex-shrink-0">
                  <CompetencesDisplay 
                    roomId={roomId} 
                    characterId={selectedCharacter.id}
                    canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
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
          <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a]">
            <h2 className="text-xl font-bold text-[#c0a0a0] mb-4">
  Modifier {selectedCharacter?.Nomperso || "Personnage"}
</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm">PV</label>
                <input
                  type="number"
                  value={editForm.PV || ''}
                  onChange={(e) => setEditForm({...editForm, PV: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">PV Maximum</label>
                <input
                  type="number"
                  value={editForm.PV_Max || ''}
                  onChange={(e) => setEditForm({...editForm, PV_Max: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Défense</label>
                <input
                  type="number"
                  value={editForm.Defense || ''}
                  onChange={(e) => setEditForm({...editForm, Defense: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Contact</label>
                <input
                  type="number"
                  value={editForm.Contact || ''}
                  onChange={(e) => setEditForm({...editForm, Contact: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Magie</label>
                <input
                  type="number"
                  value={editForm.Magie || ''}
                  onChange={(e) => setEditForm({...editForm, Magie: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Distance</label>
                <input
                  type="number"
                  value={editForm.Distance || ''}
                  onChange={(e) => setEditForm({...editForm, Distance: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Initiative</label>
                <input
                  type="number"
                  value={editForm.INIT || ''}
                  onChange={(e) => setEditForm({...editForm, INIT: parseInt(e.target.value)})}
                  className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((stat) => (
                <div key={stat} className="space-y-2">
                  <label className="text-sm">{stat}</label>
                  <input
                    type="number"
                    value={editForm[stat as keyof Character] || ''}
                    onChange={(e) => setEditForm({...editForm, [stat]: parseInt(e.target.value)})}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="bg-[#c0a080] text-[#1c1c1c] px-6 py-2 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-sm font-bold"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#2a2a2a] p-6 rounded-lg border border-[#3a3a3a] max-w-md w-full text-center">
              <h2 className="text-xl font-bold text-[#c0a0a0] mb-4">Monter de Niveau</h2>
              <p className="text-[#d4d4d4] mb-4">Lancez un dé pour augmenter les PV Max.</p>
              <button
                onClick={handleRollDie}
                className="bg-[#c0a080] text-[#1c1c1c] px-4 py-2 rounded-lg mb-4 hover:bg-[#d4b48f] transition duration-300 text-sm font-bold"
              >
                Lancer le Dé
              </button>
              {rollResult !== null && selectedCharacter && (
                <div className="text-2xl font-bold text-green-500 mb-4">
                  {rollResult - getModifier(selectedCharacter.CON || 0)} + CON ({getModifier(selectedCharacter.CON || 0)}) = {rollResult}
                </div>
              )}
              <div className="flex justify-center space-x-4">
                <button
                  onClick={confirmLevelUp}
                  className="bg-[#5c6bc0] text-white px-4 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-sm font-bold"
                >
                  Valider
                </button>
                <button
                  onClick={closeLevelUpModal}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-sm font-bold"
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
