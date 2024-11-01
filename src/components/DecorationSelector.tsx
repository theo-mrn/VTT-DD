// DecorationSelector.tsx
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface DecorationSelectorProps {
  characterId: string;
  roomId: string;
  onClose: () => void;
}

export default function DecorationSelector({ characterId, roomId, onClose }: DecorationSelectorProps) {
  const [selectedToken, setSelectedToken] = useState<string>("Token1");

  const handleSaveDecoration = async () => {
    try {
      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
      await updateDoc(characterDocRef, { Token: selectedToken });
      alert("Decoration updated!");
      onClose(); // Close the modal after saving
    } catch (error) {
      console.error("Failed to update decoration:", error);
      alert("Error updating decoration.");
    }
  };

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold mb-6">Select Decoration</h2>

      {/* Dropdown to select token */}
      <select 
        value={selectedToken} 
        onChange={(e) => setSelectedToken(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      >
        <option value="Token1">Token1</option>
        <option value="Token2">Token2</option>
        <option value="Token3">Token3</option>
        <option value="Token34">Token34</option>
        {/* Add more options as needed */}
      </select>

      <div className="flex justify-end space-x-4 mt-4">
        <button onClick={onClose} className="bg-gray-500 text-white px-4 py-2 rounded">
          Cancel
        </button>
        <button onClick={handleSaveDecoration} className="bg-blue-500 text-white px-4 py-2 rounded">
          Save
        </button>
      </div>
    </div>
  );
}
