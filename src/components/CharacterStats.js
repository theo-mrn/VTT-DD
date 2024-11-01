// components/CharacterStats.js

import React from 'react';
import { Heart, Shield } from 'lucide-react';

const CharacterStats = ({ character, bonuses }) => {
  const applyBonuses = (character) => {
    const characterBonuses = bonuses[character.id] || {};

    return {
      ...character,
      PV: character.PV + (characterBonuses.PV || 0),
      PV_Max: character.PV_Max + (characterBonuses.PV_Max || 0),
      Defense: character.Defense + (characterBonuses.Defense || 0),
      Contact: character.Contact + (characterBonuses.Contact || 0),
      Magie: character.Magic + (characterBonuses.Magic || 0), // Assuming the field is named Magic
      Distance: character.Distance + (characterBonuses.Distance || 0),
      INIT: character.INIT + (characterBonuses.INIT || 0),
      FOR: character.FOR + (characterBonuses.FOR || 0),
      DEX: character.DEX + (characterBonuses.DEX || 0),
      CON: character.CON + (characterBonuses.CON || 0),
      SAG: character.SAG + (characterBonuses.SAG || 0),
      INT: character.INT + (characterBonuses.INT || 0),
      CHA: character.CHA + (characterBonuses.CHA || 0),
    };
  };

  const finalCharacter = applyBonuses(character);

  return (
    <div>
      <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] flex justify-between items-center">
        <div className="flex items-center space-x-2" title={`Base PV: ${character.PV}, Bonus: ${bonuses[character.id]?.PV || 0}`}>
          <Heart className="text-red-500" size={24} />
          <span className="text-2xl font-bold text-[#d4d4d4]">
            {finalCharacter.PV} / {finalCharacter.PV_Max}
          </span>
        </div>
        <div className="flex items-center space-x-2" title={`Base Defense: ${character.Defense}, Bonus: ${bonuses[character.id]?.Defense || 0}`}>
          <Shield className="text-blue-500" size={24} />
          <span className="text-2xl font-bold text-[#d4d4d4]">{finalCharacter.Defense}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { name: 'Contact', value: finalCharacter.Contact },
          { name: 'Distance', value: finalCharacter.Distance },
          { name: 'Magie', value: finalCharacter.Magie },
        ].map((stat) => (
          <div key={stat.name} className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] text-center">
            <h3 className="text-lg font-semibold text-[#c0a080] mb-1">{stat.name}</h3>
            <span className="text-2xl font-bold text-[#d4d4d4]">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { name: 'FOR', value: finalCharacter.FOR },
          { name: 'DEX', value: finalCharacter.DEX },
          { name: 'CON', value: finalCharacter.CON },
          { name: 'INT', value: finalCharacter.INT },
          { name: 'SAG', value: finalCharacter.SAG },
          { name: 'CHA', value: finalCharacter.CHA },
        ].map((ability) => (
          <div key={ability.name} className="bg-[#2a2a2a] p-2 rounded-lg border border-[#3a3a3a]">
            <div className="text-[#c0a080] font-semibold">{ability.name}</div>
            <div className={`text-2xl font-bold ${getModifier(ability.value) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {getModifier(ability.value) >= 0 ? '+' : ''}{getModifier(ability.value)}
            </div>
            <div className="text-sm text-[#a0a0a0]">{ability.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const getModifier = (value) => {
  return Math.floor((value - 10) / 2);
};

export default CharacterStats;
