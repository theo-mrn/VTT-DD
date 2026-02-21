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
