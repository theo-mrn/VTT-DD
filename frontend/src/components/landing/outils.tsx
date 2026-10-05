import { BookOpen, History, Images, MessagesSquare, Music, Zap } from 'lucide-react';
import { Apparition } from './apparition';

const OUTILS = [
  {
    Icone: Music,
    titre: 'Ambiance sonore',
    texte: 'Des musiques posées sur la carte, qui montent quand on s’approche.',
  },
  {
    Icone: BookOpen,
    titre: 'Notes et documents',
    texte: 'Lettres, cartes et indices à montrer aux joueurs au bon moment.',
  },
  {
    Icone: History,
    titre: 'Historique',
    texte: 'Chaque jet, chaque coup, chaque découverte, gardés pour la suite.',
  },
  {
    Icone: MessagesSquare,
    titre: 'Bot Discord',
    texte: 'Lancez les dés de votre personnage depuis votre serveur.',
  },
  {
    Icone: Images,
    titre: 'Bibliothèque',
    texte: 'Des milliers de cartes, portraits et objets prêts à l’emploi.',
  },
  {
    Icone: Zap,
    titre: 'Temps réel',
    texte: 'Tout se synchronise à l’instant pour toute la table.',
  },
];

/** Le reste de la table, en grille sobre. */
export function Outils() {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Apparition className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Et tout le reste de la table
          </h2>
        </Apparition>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-3">
          {OUTILS.map(({ Icone, titre, texte }, i) => (
            <li key={titre} className="bg-background">
              <Apparition delai={(i % 3) * 0.06} className="h-full p-8">
                <Icone className="size-5 text-primary" aria-hidden />
                <h3 className="mt-5 text-base font-semibold text-foreground">{titre}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{texte}</p>
              </Apparition>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
