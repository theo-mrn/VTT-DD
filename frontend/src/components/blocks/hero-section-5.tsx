'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { cn } from '@/lib/utils';
import { LogoYner } from '@/components/commun/logo-yner';
import { Menu, X, Mail, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { FormulaireConnexion } from '@/components/auth/formulaire-connexion';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { Features1 } from '@/components/blocks/features1';
import { MockupCtaSection } from '@/components/blocks/mockup-cta-section';
import { StartCampaignSection } from '@/components/blocks/start-campaign-section';
import { DiceWidget } from '@/components/blocks/dice-widget';
import { FrontiereErreur } from '@/components/commun/frontiere-erreur';
import { CanvaSection } from '@/components/blocks/canva';
import { ImageAutoSlider } from '@/components/ui/image-auto-slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const HeroHeader = ({
  onOpenAuth,
  isUserLoggedIn,
  userData,
  onOpenProfile,
  onSignOut,
  router,
}: {
  onSignOut: () => Promise<void>;
  onOpenAuth: () => void;
  isUserLoggedIn: boolean | null;
  userData: any;
  onOpenProfile: () => void;
  router: any;
}) => {
  const [menuState, setMenuState] = React.useState(false);

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className="group fixed z-20 w-full pt-8 pointer-events-none"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12 pointer-events-none">
          <motion.div
            key={1}
            className="relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6 pointer-events-none"
          >
            <div className="flex w-full items-center justify-between gap-12 lg:w-auto pointer-events-none">
              <Link
                href="/"
                aria-label="home"
                className="flex items-center space-x-2 pointer-events-auto"
              >
                <Logo />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden pointer-events-auto"
              >
                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            <div className="bg-[#0c0c0e] group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border border-white/10 p-6 shadow-2xl md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none pointer-events-auto">
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                {isUserLoggedIn === null ? (
                  <div className="w-10 h-10 rounded-full bg-zinc-200/20 animate-pulse" />
                ) : isUserLoggedIn ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Avatar className="h-10 w-10 border-2 border-[#c9a965]/50 hover:border-[#c9a965] transition-all cursor-pointer shadow-md bg-white/5">
                        <AvatarImage src={userData?.pp || ''} className="object-cover" />
                        <AvatarFallback className="bg-[#c9a965] text-[#0c0c0e] font-bold">
                          {userData?.name ? userData.name.charAt(0).toUpperCase() : '?'}
                        </AvatarFallback>
                      </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-56 bg-[#0c0c0e] border-[#c9a965]/20 text-white"
                    >
                      <DropdownMenuItem
                        onClick={onOpenProfile}
                        className="focus:bg-white/10 focus:text-white cursor-pointer gap-2"
                      >
                        <User className="w-4 h-4" />
                        <span>Voir mon profil</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem
                        onClick={() => onSignOut().then(() => router.push('/'))}
                        className="focus:bg-red-500/20 focus:text-red-400 text-red-400 cursor-pointer gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Se déconnecter</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <InteractiveHoverButton
                    onClick={onOpenAuth}
                    className={cn('text-sm', 'font-logo')}
                  >
                    S&apos;identifier
                  </InteractiveHoverButton>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </nav>
    </header>
  );
};

const Logo = () => {
  return (
    <div className="flex items-center gap-3">
      <LogoYner className="size-12 text-primary drop-shadow-md" />
      <h1 className={cn('text-3xl tracking-wider text-white', 'font-logo')}>YNER</h1>
    </div>
  );
};

export function HeroSection() {
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);

  const { statut, profil, seDeconnecter } = useSession();
  const isUserLoggedIn = statut === 'chargement' ? null : statut === 'connecte';
  // Même forme que l'ancien document Firestore (pp, name) pour le menu utilisateur
  const userData = profil ? { pp: profil.avatarUrl, name: profil.name, email: profil.email } : null;
  const router = useRouter();

  const handleStartAdventure = () => {
    if (isUserLoggedIn) {
      router.push('/accueil');
    } else {
      setIsAuthModalOpen(true);
    }
  };

  return (
    <>
      <HeroHeader
        onOpenAuth={() => setIsAuthModalOpen(true)}
        isUserLoggedIn={isUserLoggedIn}
        userData={userData}
        onOpenProfile={() => router.push('/profil')}
        onSignOut={seDeconnecter}
        router={router}
      />
      <main className="overflow-x-hidden">
        <div className="relative">
          <CanvaSection onStart={handleStartAdventure} isUserLoggedIn={isUserLoggedIn} />
          <div
            className="absolute bottom-0 left-0 w-full h-[420px] pointer-events-none z-10"
            style={{
              background:
                'linear-gradient(to bottom, transparent 0%, rgba(12,12,14,0.05) 15%, rgba(12,12,14,0.25) 35%, rgba(12,12,14,0.55) 55%, rgba(12,12,14,0.85) 75%, #0c0c0e 100%)',
            }}
          />
        </div>

        <motion.section
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <Features1 />
        </motion.section>

        <motion.section
          className="bg-[#0c0c0e]"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <MockupCtaSection onStart={handleStartAdventure} />
        </motion.section>

        <motion.section
          className="bg-[#0c0c0e]"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="py-16 md:py-24 space-y-10">
            <div className="max-w-2xl mx-auto text-center px-6">
              <span
                className={cn(
                  'inline-block text-xs md:text-sm tracking-[0.3em] uppercase text-[#c9a965]/70',
                  'font-logo',
                )}
              >
                Bibliothèque
              </span>
              <h2
                className={cn(
                  'mt-3 text-4xl font-semibold lg:text-5xl gold-text-gradient',
                  'font-logo',
                )}
              >
                Plus de 1000 images et portraits
              </h2>
              <p className={cn('mt-6 text-lg text-white/60', 'font-logo')}>
                Une bibliothèque massive de portraits, cartes et tokens pour donner vie à votre
                campagne.
              </p>
            </div>
            <ImageAutoSlider />
          </div>
        </motion.section>

        <StartCampaignSection onStart={handleStartAdventure} />
      </main>

      {/* Scène 3D chargée depuis des CDN : son échec ne doit pas emporter la page */}
      <FrontiereErreur>
        <DiceWidget />
      </FrontiereErreur>

      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/70"
            onClick={() => setIsAuthModalOpen(false)}
          />
          <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
            <div className="relative">
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="absolute right-3 top-3 z-20 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <FormulaireConnexion
                carte
                redirection="/accueil"
                onConnecte={(mode) => {
                  setIsAuthModalOpen(false);
                  router.push(mode === 'inscription' ? '/bienvenue' : '/accueil');
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Footer userData={userData} />
    </>
  );
}

const Footer = ({ userData }: { userData: any }) => {
  return (
    <footer className="relative z-10 py-16 px-6 lg:px-12 bg-[#0c0c0e]">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2
              className={cn(
                'text-3xl md:text-4xl font-bold tracking-tight gold-text-gradient',
                'font-logo',
              )}
            >
              Un retour ?
            </h2>
            <p className={cn('text-zinc-400 text-lg max-w-md', 'font-logo')}>
              Votre avis nous aide à améliorer l&apos;aventure ! Dites-nous tout.
            </p>
            <div className="flex flex-wrap gap-4">
              <FeedbackDialog userData={userData} />
            </div>
          </div>
          <div className="flex flex-col md:items-end gap-6">
            <Logo />
            <div className="flex gap-6 text-zinc-500 text-sm">
              <Link href="/mentions-legales" className="hover:text-[#c9a965] transition-colors">
                Mentions Légales
              </Link>
            </div>
            <p className="text-zinc-600 text-xs">
              © {new Date().getFullYear()} YNER. Fait avec passion pour les rôlistes.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

const FeedbackDialog = ({ userData }: { userData: any }) => {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      // Pas encore de service « retours » dans la nouvelle stack : envoi par e-mail
      const sujet = encodeURIComponent('Retour sur YNER');
      const corps = encodeURIComponent(`${message}\n\n— ${userData?.name || 'Aventurier anonyme'}`);
      window.location.href = `mailto:contact@yner.fr?subject=${sujet}&body=${corps}`;
      setOpen(false);
      setMessage('');
    } catch (error) {
      console.error("Erreur lors de l'envoi du retour :", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn('rounded-full h-12 px-8', 'font-logo')}>
          <Mail className="mr-2 h-5 w-5" />
          Nous écrire
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-[#0c0c0e] border-[#c9a965]/20 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className={cn('text-2xl gold-text-gradient', 'font-logo')}>
            Envoyer un feedback
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Une idée, un bug ou juste un mot doux ? Nous sommes à l&apos;écoute.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="message" className={cn('text-sm font-medium', 'font-logo')}>
              Message
            </Label>
            <Textarea
              id="message"
              placeholder="Votre message ici..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              disabled={isSending}
              className="min-h-[150px] bg-white/5 border-[#c9a965]/20 focus:border-[#c9a965]/40 focus:ring-0 text-white resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isSending}
              className={cn('w-full h-12 rounded-xl group', 'font-logo')}
            >
              {isSending ? (
                <span className="flex items-center">
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />
                  Envoi en cours...
                </span>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  Envoyer directement
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
