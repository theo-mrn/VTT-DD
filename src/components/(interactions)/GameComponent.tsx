"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, RotateCcw, Users } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { GameInteraction, Character } from '@/app/[roomid]/map/types';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface GameComponentProps {
    isOpen: boolean;
    onClose: () => void;
    interaction: GameInteraction;
    gameHost: Character;
    roomId: string;
    currentPlayerId?: string;
}

interface ChessGameState {
    fen: string;
    whitePlayer: string | null;
    blackPlayer: string | null;
    turn: 'w' | 'b';
    lastMove?: string;
}

export default function GameComponent({
    isOpen,
    onClose,
    interaction,
    gameHost,
    roomId,
    currentPlayerId
}: GameComponentProps) {
    // Moteur de jeu d'échecs
    const chessGameRef = useRef(new Chess());
    const [fen, setFen] = useState(chessGameRef.current.fen());
    const [gameStatus, setGameStatus] = useState("");

    // États multijoueur
    const [selectedSide, setSelectedSide] = useState<'white' | 'black' | null>(null);
    const [whitePlayer, setWhitePlayer] = useState<string | null>(null);
    const [blackPlayer, setBlackPlayer] = useState<string | null>(null);
    const [showSideSelection, setShowSideSelection] = useState(true);

    const gameDocPath = `cartes/${roomId}/games/${interaction.id}`;

    // Initialiser et écouter l'état du jeu depuis Firebase
    useEffect(() => {
        console.log('[Chess] UseEffect - isOpen:', isOpen, 'roomId:', roomId, 'currentPlayerId:', currentPlayerId);
        if (!isOpen || !roomId) return;

        const gameRef = doc(db, gameDocPath);
        console.log('[Chess] gameDocPath:', gameDocPath);

        // Charger l'état initial
        getDoc(gameRef).then((docSnap) => {
            console.log('[Chess] Initial load - exists:', docSnap.exists());
            if (docSnap.exists()) {
                const data = docSnap.data() as ChessGameState;
                console.log('[Chess] Initial data:', data);
                chessGameRef.current.load(data.fen);
                setFen(data.fen);
                setWhitePlayer(data.whitePlayer);
                setBlackPlayer(data.blackPlayer);

                // Déterminer le camp du joueur actuel
                if (currentPlayerId) {
                    console.log('[Chess] Checking player side - currentPlayerId:', currentPlayerId, 'whitePlayer:', data.whitePlayer, 'blackPlayer:', data.blackPlayer);
                    if (data.whitePlayer === currentPlayerId) {
                        console.log('[Chess] Player is white');
                        setSelectedSide('white');
                        setShowSideSelection(false);
                    } else if (data.blackPlayer === currentPlayerId) {
                        console.log('[Chess] Player is black');
                        setSelectedSide('black');
                        setShowSideSelection(false);
                    }
                }
            }
        });

        // Écouter les changements en temps réel
        const unsubscribe = onSnapshot(gameRef, (docSnap) => {
            console.log('[Chess] Snapshot update - exists:', docSnap.exists());
            if (docSnap.exists()) {
                const data = docSnap.data() as ChessGameState;
                console.log('[Chess] Updated data:', data);
                chessGameRef.current.load(data.fen);
                setFen(data.fen);
                setWhitePlayer(data.whitePlayer);
                setBlackPlayer(data.blackPlayer);
                setGameStatus(getGameStatus(chessGameRef.current));
            }
        });

        return () => unsubscribe();
    }, [isOpen, roomId, interaction.id, currentPlayerId]);

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

    async function handleSelectSide(side: 'white' | 'black') {
        console.log('[Chess] handleSelectSide called - side:', side, 'currentPlayerId:', currentPlayerId);
        console.log('[Chess] Current state - whitePlayer:', whitePlayer, 'blackPlayer:', blackPlayer);

        if (!currentPlayerId) {
            console.log('[Chess] No currentPlayerId, aborting');
            return;
        }

        const gameRef = doc(db, gameDocPath);
        const updates: Partial<ChessGameState> = {
            fen: chessGameRef.current.fen(),
            turn: 'w'
        };

        if (side === 'white') {
            console.log('[Chess] Setting white player to:', currentPlayerId);
            updates.whitePlayer = currentPlayerId;
            setWhitePlayer(currentPlayerId);
        } else {
            console.log('[Chess] Setting black player to:', currentPlayerId);
            updates.blackPlayer = currentPlayerId;
            setBlackPlayer(currentPlayerId);
        }

        console.log('[Chess] Saving to Firebase:', updates);
        try {
            await setDoc(gameRef, updates, { merge: true });
            console.log('[Chess] Save successful');
            setSelectedSide(side);
            setShowSideSelection(false);
        } catch (error) {
            console.error('[Chess] Error saving to Firebase:', error);
        }
    }

    function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
        const game = chessGameRef.current;

        // Vérifier que targetSquare n'est pas null
        if (!targetSquare) return false;

        // Vérifier que c'est le tour du joueur
        const currentTurn = game.turn();
        if (selectedSide === 'white' && currentTurn !== 'w') return false;
        if (selectedSide === 'black' && currentTurn !== 'b') return false;

        // Logique chess.js
        const move = game.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q", // Toujours reine pour l'exemple
        });

        // Si le mouvement est valide
        if (move) {
            const newFen = game.fen();
            setFen(newFen);
            setGameStatus(getGameStatus(game));

            // Sauvegarder dans Firebase (async, sans bloquer)
            const gameRef = doc(db, gameDocPath);
            setDoc(gameRef, {
                fen: newFen,
                whitePlayer,
                blackPlayer,
                turn: game.turn(),
                lastMove: `${sourceSquare}-${targetSquare}`
            } as ChessGameState).catch(err => {
                console.error("Erreur lors de la sauvegarde:", err);
            });

            return true;
        }

        return false;
    }

    async function resetGame() {
        chessGameRef.current.reset();
        const newFen = chessGameRef.current.fen();
        setFen(newFen);
        setGameStatus("");

        // Réinitialiser dans Firebase
        const gameRef = doc(db, gameDocPath);
        await setDoc(gameRef, {
            fen: newFen,
            whitePlayer,
            blackPlayer,
            turn: 'w',
            lastMove: undefined
        } as ChessGameState);
    }

    if (!isOpen) return null;

    // Déterminer l'orientation de l'échiquier
    const boardOrientation = selectedSide === 'black' ? 'black' : 'white';

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

                        {/* Side Selection Overlay */}
                        {showSideSelection && (
                            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-md">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-[#1a1a1a] border border-[#444] rounded-2xl p-8 space-y-6 max-w-md"
                                >
                                    <div className="text-center">
                                        <div className="inline-block p-3 bg-purple-900/30 rounded-xl mb-4">
                                            <Users size={32} className="text-purple-400" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white mb-2">Choisissez votre camp</h3>
                                        <p className="text-gray-400 text-sm">
                                            Sélectionnez les blancs ou les noirs pour commencer à jouer
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <Button
                                            onClick={() => {
                                                console.log('[Chess] White button clicked');
                                                handleSelectSide('white');
                                            }}
                                            disabled={!!whitePlayer && whitePlayer !== currentPlayerId}
                                            variant="outline"
                                            size="lg"
                                            className="h-20 text-lg font-semibold"
                                        >
                                            Blancs
                                            {whitePlayer && <span className="text-xs ml-2">(Occupé)</span>}
                                        </Button>

                                        <Button
                                            onClick={() => {
                                                console.log('[Chess] Black button clicked');
                                                console.log('[Chess] blackPlayer:', blackPlayer, 'currentPlayerId:', currentPlayerId);
                                                console.log('[Chess] Button disabled?', !!blackPlayer && blackPlayer !== currentPlayerId);
                                                handleSelectSide('black');
                                            }}
                                            disabled={!!blackPlayer && blackPlayer !== currentPlayerId}
                                            variant="outline"
                                            size="lg"
                                            className="h-20 text-lg font-semibold"
                                        >
                                            Noirs
                                            {blackPlayer && <span className="text-xs ml-2">(Occupé)</span>}
                                        </Button>
                                    </div>

                                    {/* Debug info */}
                                    <div className="text-xs text-gray-500 text-center space-y-1">
                                        <div>White: {whitePlayer || 'null'}</div>
                                        <div>Black: {blackPlayer || 'null'}</div>
                                        <div>Current: {currentPlayerId || 'null'}</div>
                                    </div>

                                    {whitePlayer && blackPlayer && (
                                        <div className="text-center text-green-400 text-sm">
                                            ✓ Les deux camps sont prêts !
                                        </div>
                                    )}
                                </motion.div>
                            </div>
                        )}

                        {/* Main Content */}
                        <div className="flex-1 flex min-h-0 p-8 gap-6 overflow-y-auto">
                            {/* Left Side: Chessboard */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">

                                {/* Player Info */}
                                <div className="flex gap-4 items-center">
                                    <Badge className="bg-white/10 border-white/20 text-white px-3 py-1">
                                        <span className="mr-1">♔</span> {whitePlayer ? "Occupé" : "Libre"}
                                    </Badge>
                                    <Badge className="bg-white/10 border-white/20 text-white px-3 py-1">
                                        <span className="mr-1">♚</span> {blackPlayer ? "Occupé" : "Libre"}
                                    </Badge>
                                </div>

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
                                <div
                                    className={`w-[450px] h-[450px] rounded-xl overflow-hidden shadow-2xl border-4 border-purple-900/30`}
                                >
                                    <Chessboard
                                        options={{
                                            position: fen,
                                            onPieceDrop: onDrop,
                                            // @ts-ignore - boardOrientation existe dans la lib mais n'est pas dans les types
                                            boardOrientation: selectedSide === 'black' ? 'black' : 'white',
                                        }}
                                    />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => setShowSideSelection(true)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold gap-2"
                                    >
                                        <Users size={16} />
                                        Changer de camp
                                    </Button>
                                    <Button
                                        onClick={resetGame}
                                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-semibold gap-2"
                                    >
                                        <RotateCcw size={16} />
                                        Nouvelle Partie
                                    </Button>
                                </div>
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
                                            "Deux esprits stratégiques s'affrontent. Que la meilleure tactique l'emporte !"
                                        </p>
                                    </div>

                                    {/* Game Rules */}
                                    <div className="bg-purple-950/30 backdrop-blur-md rounded-xl border border-purple-500/20 p-4">
                                        <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Mode Multijoueur</h4>
                                        <ul className="text-xs text-gray-400 space-y-1">
                                            <li>• Choisissez votre camp (blanc ou noir)</li>
                                            <li>• Attendez votre tour pour jouer</li>
                                            <li>• Les coups sont synchronisés en temps réel</li>
                                            <li>• Promotion automatique en Reine</li>
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
