// RollPromptModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { doc, setDoc,db, collection, onSnapshot } from "@/lib/firebase";

type RollPromptModalProps = {
  roomId: string;
  playerId: string;
  requestId: string | null;
  selectedAbility: string | null;
  onClose: () => void;
};

export default function RollPromptModal({
  roomId,
  playerId,
  requestId,
  selectedAbility,
  onClose,
}: RollPromptModalProps) {
  const [rollResult, setRollResult] = useState<number | null>(null);

  const handleRoll = async () => {
    if (!requestId || !selectedAbility) return;

    const abilityValue = 10; // Replace with the player's actual ability value if available
    const modifier = Math.floor((abilityValue - 10) / 2);
    const dice = Math.floor(Math.random() * 20) + 1;
    const result = dice + modifier;

    // Save roll result in Firestore
    await setDoc(
      doc(
        collection(
          db,
          `Rollsrequests/${roomId}/requete/${requestId}/results`
        ),
        playerId
      ),
      { result, dice, modifier }
    );

    setRollResult(result);
    onClose(); // Close modal after roll
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded shadow-lg text-center w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-4">
          Roll for {selectedAbility}
        </h2>
        <p className="mb-4">Please roll a die for the requested ability.</p>
        <Button onClick={handleRoll}>Roll Dice</Button>
      </div>
    </div>
  );
}
