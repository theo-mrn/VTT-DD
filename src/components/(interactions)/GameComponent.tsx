"use client";

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, RotateCcw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { GameInteraction, Character } from '@/app/[roomid]/map/types';

interface GameComponentProps {
    isOpen: boolean;
    onClose: () => void;
    interaction: GameInteraction;
    gameHost: Character;
}

export default function GameComponent({
    isOpen,
    onClose,
    interaction,
    gameHost
}: GameComponentProps) {
    // Moteur de jeu d'échecs
    const chessGameRef = useRef(new Chess());
    const [fen, setFen] = useState(chessGameRef.current.fen());
    const [gameStatus, setGameStatus] = useState("");

    function getGameStatus(game: Chess) {
        if (game.isCheckmate()) {
            return `Échec et mat ! ${game.turn() === "w" ? "Les noirs" : "Les blancs"} gagnent !`;
        }
        if (game.isDraw()) {
            return "Partie nulle !";
        }
        if (game.isStalemate()) {
            return "Pat ! Partie nulle.";
        }
        if (game.isThreefoldRepetition()) {
            return "Nulle par répétition triple.";
        }
        if (game.isInsufficientMaterial()) {
            return "Nulle - matériel insuffisant.";
        }
        if (game.isCheck()) {
            return `Échec ${game.turn() === "w" ? "aux blancs" : "aux noirs"} !`;
        }
        return `Tour des ${game.turn() === "w" ? "blancs" : "noirs"}`;
    }

    function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
        const game = chessGameRef.current;

        // Vérifier que targetSquare n'est pas null
        if (!targetSquare) return false;

        // Logique chess.js
        const move = game.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q", // Toujours reine pour l'exemple
        });

        // Si le mouvement est valide
        if (move) {
            setFen(game.fen());
            setGameStatus(getGameStatus(game));
            return true;
        }

        return false;
    }

    function resetGame() {
        chessGameRef.current.reset();
        setFen(chessGameRef.current.fen());
        setGameStatus("");
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-6xl bg-gradient-to-br from-[#1a1a1a] via-[#1e1e1e] to-[#141414] border border-[#444] rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[95vh]"
                    >
                        {/* Close Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-4 right-4 z-50 text-white/50 hover:text-white hover:bg-black/50 rounded-full"
                            onClick={onClose}
                        >
                            <X size={24} />
                        </Button>

                        {/* Main Content */}
                        <div className="flex-1 flex min-h-0 p-8 gap-6 overflow-y-auto">
                            {/* Left Side: Chessboard */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                {/* Description */}
                                {interaction.description && (
                                    <div className="bg-[#252525]/50 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm max-w-2xl">
                                        <p className="text-gray-300 italic text-center text-sm">
                                            "{interaction.description}"
                                        </p>
                                    </div>
                                )}

                                {/* Game Status */}
                                <div className="bg-gradient-to-r from-purple-950/40 to-blue-950/40 px-6 py-3 rounded-xl border border-purple-500/20 min-w-[450px]">
                                    <p className={`text-lg font-semibold text-center ${gameStatus.includes("Échec et mat") ? "text-red-400" :
                                        gameStatus.includes("Échec") ? "text-yellow-400" :
                                            gameStatus.includes("nulle") || gameStatus.includes("Pat") ? "text-blue-400" :
                                                "text-white"
                                        }`}>
                                        {gameStatus || getGameStatus(chessGameRef.current)}
                                    </p>
                                </div>

                                {/* Chessboard */}
                                <div className="w-[450px] h-[450px] rounded-xl overflow-hidden shadow-2xl border-4 border-purple-900/30">
                                    <Chessboard
                                        options={{
                                            position: fen,
                                            onPieceDrop: onDrop,
                                        }}
                                    />
                                </div>

                                {/* Reset Button */}
                                <Button
                                    onClick={resetGame}
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-semibold gap-2 shadow-lg"
                                >
                                    <RotateCcw size={18} />
                                    Nouvelle Partie
                                </Button>
                            </div>

                            {/* Right Side: Game Host Info */}
                            <div className="w-[300px] bg-[#0f0f0f] relative border border-[#333] rounded-2xl shrink-0 overflow-hidden">
                                <div className="absolute inset-0">
                                    {/* Host Background/Image */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-transparent to-transparent z-10" />
                                    {gameHost.image && (
                                        <img
                                            src={typeof gameHost.image === 'object' ? gameHost.image.src : gameHost.image}
                                            alt={gameHost.name}
                                            className="w-full h-full object-cover opacity-40"
                                        />
                                    )}
                                </div>

                                <div className="absolute bottom-0 left-0 right-0 p-6 z-20 space-y-4">
                                    <div>
                                        <h3 className="text-2xl font-bold text-white font-serif mb-2 text-shadow-lg">
                                            {gameHost.name}
                                        </h3>
                                        <Badge variant="secondary" className="bg-purple-900/40 text-purple-200 border border-purple-500/30">
                                            Maître du Jeu
                                        </Badge>
                                    </div>

                                    <div className="bg-black/60 backdrop-blur-md rounded-xl border border-white/5 p-4">
                                        <p className="text-sm text-gray-300 italic leading-relaxed">
                                            "Bienvenue à la table d'échecs ! Que le meilleur stratège l'emporte."
                                        </p>
                                    </div>

                                    {/* Game Rules */}
                                    <div className="bg-purple-950/30 backdrop-blur-md rounded-xl border border-purple-500/20 p-4">
                                        <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Règles</h4>
                                        <ul className="text-xs text-gray-400 space-y-1">
                                            <li>• Déplacez les pièces selon les règles standards</li>
                                            <li>• La promotion est automatique en Reine</li>
                                            <li>• Cliquez sur "Nouvelle Partie" pour recommencer</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
