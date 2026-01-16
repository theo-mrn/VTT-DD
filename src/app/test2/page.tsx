"use client";
import React, { useState, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

export default function App() {
    // 1. UTILISATION DE REF
    // useRef garde le moteur de jeu en mémoire sans déclencher de re-render
    const chessGameRef = useRef(new Chess());

    // 2. STATE POUR L'AFFICHAGE
    // Seule la chaîne FEN déclenche le re-render graphique
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

        // 3. LOGIQUE CHESS.JS
        const move = game.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q", // Toujours reine pour l'exemple
        });

        // Si le mouvement est valide (move n'est pas null)
        if (move) {
            // On met à jour l'affichage
            setFen(game.fen());
            setGameStatus(getGameStatus(game));
            return true;
        }

        // Mouvement invalide
        return false;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 gap-6">
            <h1 className="text-white text-3xl font-bold">Jeu d'échecs</h1>

            {/* Statut de la partie */}
            <div className="bg-neutral-800 px-6 py-3 rounded-lg min-w-[400px] text-center">
                <p className={`text-xl font-semibold ${gameStatus.includes("Échec et mat") ? "text-red-500" :
                        gameStatus.includes("Échec") ? "text-yellow-500" :
                            gameStatus.includes("nulle") || gameStatus.includes("Pat") ? "text-blue-500" :
                                "text-white"
                    }`}>
                    {gameStatus || getGameStatus(chessGameRef.current)}
                </p>
            </div>

            <div style={{ width: "400px", height: "400px" }}>
                <Chessboard
                    options={{
                        position: fen,
                        onPieceDrop: onDrop,
                    }}
                />
            </div>
        </div>
    );
}