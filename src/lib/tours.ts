import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export const startSidebarTour = (isMJ: boolean) => {
    let driverObj: any;

    // Helper function to create interactive steps
    const addInteractiveStep = (buttonId: string, panelTitle: string, panelDesc: string, showMJ: boolean = true) => {
        if (!showMJ) return;

        // Step 1: Tell user to click the button
        steps.push({
            element: buttonId,
            popover: {
                title: panelTitle,
                description: `Cliquez pour ouvrir.`,
                position: "right",
                showButtons: [], // Hide all buttons
            },
            onHighlighted: (element) => {
                const btn = element as HTMLElement;
                const clickHandler = () => {
                    btn.removeEventListener('click', clickHandler);
                    // Small delay to ensure panel starts opening before moving to next step
                    setTimeout(() => driverObj.moveNext(), 100);
                };
                btn.addEventListener('click', clickHandler);
            }
        } as DriveStep);

        // Step 2: Show description once panel is open
        steps.push({
            element: "#vtt-side-panel",
            popover: {
                title: panelTitle,
                description: panelDesc,
                position: "right"
            }
        } as DriveStep);
    };

    const steps: DriveStep[] = [];

    if (isMJ) {
        addInteractiveStep("#vtt-sidebar-combat", "Tableau de Bord MJ", "Gérez vos combats et l'initiative.");
        addInteractiveStep("#vtt-sidebar-npc", "Gestionnaire de PNJ", "Accédez à vos fiches de personnages non-joueurs.");
        addInteractiveStep("#vtt-sidebar-encounter", "Générateur de Rencontres", "Préparez vos combats rapidement.");
    }

    addInteractiveStep("#vtt-sidebar-fiche", "Feuille de Personnage", "Consultez vos statistiques et inventaire.");

    // Deep dive into Fiche
    steps.push(
        {
            element: "#vtt-fiche-btn-modifier",
            popover: {
                title: "Modifier le Personnage",
                description: "Éditez vos statistiques de base, vos PV et vos modificateurs.",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-fiche-btn-level-up",
            popover: {
                title: "Monter de Niveau",
                description: "Lancez les dés pour augmenter vos PV Maximum lors d'un passage de niveau.",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-fiche-btn-stats",
            popover: {
                title: "Statistiques Globales",
                description: "Affichez une vue d'ensemble des statistiques de tous les joueurs (utile pour le MJ).",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-widget-stats-view",
            popover: {
                title: "Statistiques de Combat",
                description: "Vos scores de FOR, DEX, CON, etc. Cliquez sur une stat pour lancer un test.",
                position: "right"
            }
        } as DriveStep,
        {
            element: "#vtt-widget-inventory-view",
            popover: {
                title: "Inventaire",
                description: "Gérez votre équipement, vos potions et vos richesses.",
                position: "top"
            }
        } as DriveStep,
        {
            element: "#vtt-inventory-search",
            popover: {
                title: "Recherche d'Items",
                description: "Trouvez rapidement un objet dans votre sac.",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-inventory-btn-add",
            popover: {
                title: "Ajouter un Objet",
                description: "Ajoutez des objets prédéfinis ou créez les vôtres.",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-widget-skills-view",
            popover: {
                title: "Compétences",
                description: "Consultez vos capacités spéciales et leurs descriptions.",
                position: "top"
            }
        } as DriveStep,
        {
            element: "#vtt-skills-btn-fullscreen",
            popover: {
                title: "Gestion Complète",
                description: "Cliquez sur cette roue pour ouvrir l'interface complète de gestion des compétences.",
                position: "bottom"
            }
        } as DriveStep,
        {
            element: "#vtt-skills-btn-manage-voies",
            popover: {
                title: "Gestion des Voies",
                description: "Choisissez et personnalisez vos voies de progression.",
                position: "bottom"
            }
        } as DriveStep
    );

    addInteractiveStep("#vtt-sidebar-notes", "Notes de Campagne", "Gardez une trace de vos découvertes.");

    // For Dice Roller and Chat
    steps.push(
        {
            element: "#vtt-sidebar-dice",
            popover: {
                title: "Lanceur de Dés",
                description: "Cliquez pour lancer les dés.",
                position: "right",
                showButtons: [],
            },
            onHighlighted: (element) => {
                const btn = element as HTMLElement;
                const handler = () => {
                    btn.removeEventListener('click', handler);
                    setTimeout(() => driverObj.moveNext(), 100);
                };
                btn.addEventListener('click', handler);
            }
        } as DriveStep,
        {
            element: "#vtt-sidebar-chat",
            popover: {
                title: "Messagerie & Galerie",
                description: "Cliquez pour ouvrir le chat.",
                position: "right",
                showButtons: [],
            },
            onHighlighted: (element) => {
                const btn = element as HTMLElement;
                const handler = () => {
                    btn.removeEventListener('click', handler);
                    setTimeout(() => driverObj.moveNext(), 100);
                };
                btn.addEventListener('click', handler);
            }
        } as DriveStep
    );

    driverObj = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: 'rgba(0,0,0,0.7)',
        steps: steps,
        nextBtnText: 'Suivant',
        prevBtnText: 'Précédent',
        doneBtnText: 'Terminer',
    });

    driverObj.drive();
};
