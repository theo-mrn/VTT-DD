/**
 * useActiveAttackTargets.ts — IDs des personnages ciblés par l'attaquant actif du combat
 *
 * N'écoute les rapports d'attaque que si le personnage actif du tour est un JOUEUR :
 * une attaque lancée par un PNJ/allié, ou par un joueur hors de son tour, ne doit
 * jamais faire surligner de cible sur la carte du MJ.
 *
 * Deux sources sont combinées :
 * - `combat/{id}/engaged/current` : marqueur écrit dès le lancer du dé d'attaque,
 *   avant même de connaître le résultat, pour un surlignage immédiat.
 * - `combat/{id}/rapport` : rapports de dégâts finaux (couvre la fenêtre jusqu'à
 *   ce que le MJ traite l'attaque).
 * Le marqueur `engaged` expire après ENGAGED_TTL_MS pour ne jamais rester périmé
 * si le MJ ne referme pas le combat.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ENGAGED_TTL_MS = 15000;

export function useActiveAttackTargets(
    roomId: string | null,
    activePlayerId: string | null,
    isActivePlayerAPlayerCharacter: boolean
): Set<string> {
    const [engagedTargetIds, setEngagedTargetIds] = useState<Set<string>>(new Set());
    const [reportedTargetIds, setReportedTargetIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!roomId || !activePlayerId || !isActivePlayerAPlayerCharacter) {
            setEngagedTargetIds(new Set());
            setReportedTargetIds(new Set());
            return;
        }

        const unsubscribes: Array<() => void> = [];
        let expiryTimer: ReturnType<typeof setTimeout> | null = null;

        const engagedRef = doc(db, `cartes/${roomId}/combat/${activePlayerId}/engaged/current`);
        unsubscribes.push(onSnapshot(engagedRef, (snap) => {
            if (expiryTimer) clearTimeout(expiryTimer);

            if (!snap.exists()) {
                setEngagedTargetIds(new Set());
                return;
            }

            const data = snap.data();
            const timestamp = data.timestamp || 0;
            const age = Date.now() - timestamp;

            if (age > ENGAGED_TTL_MS) {
                setEngagedTargetIds(new Set());
                return;
            }

            setEngagedTargetIds(new Set<string>(data.targets || []));
            expiryTimer = setTimeout(() => setEngagedTargetIds(new Set()), ENGAGED_TTL_MS - age);
        }));

        const rapportRef = collection(db, `cartes/${roomId}/combat/${activePlayerId}/rapport`);
        unsubscribes.push(onSnapshot(rapportRef, (snapshot) => {
            const ids = new Set<string>();
            snapshot.docs.forEach(d => {
                const cible = d.data().cible;
                if (cible) ids.add(cible);
            });
            setReportedTargetIds(ids);
        }));

        return () => {
            if (expiryTimer) clearTimeout(expiryTimer);
            unsubscribes.forEach(u => u());
        };
    }, [roomId, activePlayerId, isActivePlayerAPlayerCharacter]);

    return useMemo(
        () => new Set<string>([...engagedTargetIds, ...reportedTargetIds]),
        [engagedTargetIds, reportedTargetIds]
    );
}
