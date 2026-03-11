"use client"

import { 
  Menu, 
  ShoppingCart, 
  Search, 
  Users, 
  LayoutDashboard, 
  User as UserIcon,
  LogOut,
  PlusCircle,
  Library,
  Skull,
  Zap,
  ImageIcon,
  Store
} from "lucide-react";
import * as React from "react";
import { signOut } from 'firebase/auth'
import { auth as firebaseAuth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Aclonica } from "next/font/google"

const aclonica = Aclonica({ weight: '400', subsets: ['latin'] })

interface MenuItem {
  title: string;
  url?: string;
  description?: string;
  icon?: React.ReactNode;
  items?: MenuItem[];
  onClick?: () => void;
}

interface NavbarProps {
  logo?: {
    url: string;
    src: string;
    alt: string;
    title: string;
  };
  menu?: MenuItem[];
  isUserLoggedIn?: boolean | null;
  userData?: any;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  onOpenStore?: () => void;
}

export default function Navbar({
  logo = {
    url: "/",
    src: "/logo.png",
    alt: "YNER logo",
    title: "YNER",
  },
  isUserLoggedIn,
  userData,
  onOpenAuth,
  onOpenProfile,
  onOpenStore,
  menu = [
    { title: "Mes campagnes", url: "/mes-campagnes", icon: <LayoutDashboard className="size-5 shrink-0" /> },
    { title: "Rejoindre", url: "/rejoindre", icon: <Users className="size-5 shrink-0" /> },
    { title: "Créer", url: "/creer", icon: <PlusCircle className="size-5 shrink-0" /> },
    { title: "Boutique", onClick: onOpenStore, icon: <ShoppingCart className="size-5 shrink-0" /> },
    { 
      title: "Ressources", 
      icon: <Library className="size-5 shrink-0" />,
      items: [
        {
          title: "Bestiaire",
          description: "Consultez la liste des créatures et monstres.",
          icon: <Skull className="size-5 shrink-0" />,
          url: "/ressources/bestiaire",
        },
        {
          title: "Capacités",
          description: "Explorez les sorts, talents et aptitudes.",
          icon: <Zap className="size-5 shrink-0" />,
          url: "/ressources/capacites",
        },
        {
          title: "Images",
          description: "Gérez votre bibliothèque d'illustrations.",
          icon: <ImageIcon className="size-5 shrink-0" />,
          url: "/ressources/images",
        },
        {
          title: "Marché",
          description: "Accédez aux objets et équipements disponibles.",
          icon: <Store className="size-5 shrink-0" />,
          url: "/ressources/marche",
        },
      ]
    },
  ],
}: NavbarProps) {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const router = useRouter()

  const handleSignOut = () => {
    signOut(firebaseAuth).then(() => router.push("/"))
  }

  const renderAuthButtons = (isMobile = false) => {
    if (isUserLoggedIn === null) {
      return <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
    }

    if (isUserLoggedIn) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="h-9 w-9 border border-border hover:opacity-80 transition-all cursor-pointer">
              <AvatarImage src={userData?.pp || ""} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                {userData?.name ? userData.name.charAt(0).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onOpenProfile} className="cursor-pointer gap-2">
              <UserIcon className="w-4 h-4" />
              <span>Voir mon profil</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer gap-2">
              <LogOut className="w-4 h-4" />
              <span>Se déconnecter</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <Button onClick={onOpenAuth} size="sm" className={cn(aclonica.className, isMobile && "w-full")}>
        S&apos;identifier
      </Button>
    )
  }

  return (
    <section className="py-4 fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 shadow-sm">
      <div className="container mx-auto px-4 md:px-6">
        {/* Desktop Navbar */}
        <nav className="hidden justify-between lg:flex items-center h-12">
          <div className="flex items-center gap-8">
            <Link href={logo.url} className="flex items-center gap-3">
              <img src={logo.src} className="h-8 w-auto" alt={logo.alt} />
              <span className={cn("text-2xl font-bold tracking-wider", aclonica.className)}>{logo.title}</span>
            </Link>
            <div className="flex items-center">
              <NavigationMenu className="[&_[data-radix-navigation-menu-viewport]]:rounded-3xl [&>div]:justify-end">
                <NavigationMenuList className="rounded-3xl">
                  {menu.map((item) => renderMenuItem(item))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Auth Section */}
            {renderAuthButtons()}
          </div>
        </nav>

        {/* Mobile Navbar */}
        <div className="block lg:hidden h-12">
          <div className="flex items-center justify-between h-full">
            <Link href={logo.url} className="flex items-center gap-2">
              <img src={logo.src} className="h-7 w-auto" alt={logo.alt} />
              <span className={cn("text-xl font-bold tracking-wider", aclonica.className)}>{logo.title}</span>
            </Link>
            <div className="flex items-center gap-2">
              {/* Menu Sheet */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>
                      <Link href={logo.url} className="flex items-center gap-2">
                        <img src={logo.src} className="w-8" alt={logo.alt} />
                        <span className={cn("text-xl font-bold tracking-wider", aclonica.className)}>{logo.title}</span>
                      </Link>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="my-6 flex flex-col gap-6">
                    <Accordion
                      type="single"
                      collapsible
                      className="flex w-full flex-col gap-4"
                    >
                      {menu.map((item) => renderMobileMenuItem(item))}
                    </Accordion>
                    
                    <div className="flex flex-col gap-3 pt-4 border-t border-border">
                      {renderAuthButtons(true)}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const renderMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <NavigationMenuItem key={item.title} className="text-muted-foreground !rounded-3xl">
        <NavigationMenuTrigger className="!rounded-3xl bg-transparent hover:bg-muted hover:text-foreground transition-all duration-200">{item.title}</NavigationMenuTrigger>
        <NavigationMenuContent className="!rounded-3xl">
          <ul className="w-80 p-3">
            {item.items.map((subItem) => (
              <li key={subItem.title}>
                {subItem.url ? (
                  <NavigationMenuLink asChild className="!rounded-3xl">
                    <Link
                      className="flex select-none gap-4 rounded-xl p-3 leading-none no-underline outline-none transition-all duration-200 hover:bg-muted hover:text-accent-foreground"
                      href={subItem.url}
                    >
                      {subItem.icon}
                      <div>
                        <div className="text-sm font-semibold">
                          {subItem.title}
                        </div>
                        {subItem.description && (
                          <p className="text-sm leading-snug text-muted-foreground mt-1">
                            {subItem.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </NavigationMenuLink>
                ) : (
                  <NavigationMenuLink asChild className="!rounded-3xl">
                    <button
                      className="flex w-full select-none gap-4 rounded-xl p-3 leading-none no-underline outline-none transition-all duration-200 hover:bg-muted hover:text-accent-foreground text-left"
                      onClick={subItem.onClick}
                    >
                      {subItem.icon}
                      <div>
                        <div className="text-sm font-semibold">
                          {subItem.title}
                        </div>
                        {subItem.description && (
                          <p className="text-sm leading-snug text-muted-foreground mt-1">
                            {subItem.description}
                          </p>
                        )}
                      </div>
                    </button>
                  </NavigationMenuLink>
                )}
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }

  if (item.url) {
    return (
      <Link
        key={item.title}
        className="group inline-flex h-10 w-max items-center justify-center rounded-xl bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
        href={item.url}
      >
        {item.title}
      </Link>
    );
  }

  return (
    <button
      key={item.title}
      className="group inline-flex h-10 w-max items-center justify-center rounded-xl bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
      onClick={item.onClick}
    >
      {item.title}
    </button>
  );
};

const renderMobileMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0">
        <AccordionTrigger className="py-2 px-2 font-semibold hover:no-underline rounded-lg hover:bg-muted transition-all duration-200">
          <div className="flex items-center gap-2">
            {item.icon}
            <span>{item.title}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="mt-2 space-y-1">
          {item.items.map((subItem) => (
            subItem.url ? (
              <Link
                key={subItem.title}
                className="flex select-none gap-4 rounded-lg p-3 leading-none outline-none transition-all duration-200 hover:bg-muted hover:text-accent-foreground"
                href={subItem.url}
              >
                {subItem.icon}
                <div>
                  <div className="text-sm font-semibold">{subItem.title}</div>
                  {subItem.description && (
                    <p className="text-sm leading-snug text-muted-foreground mt-1">
                      {subItem.description}
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <button
                key={subItem.title}
                className="flex w-full select-none gap-4 rounded-lg p-3 leading-none outline-none transition-all duration-200 hover:bg-muted hover:text-accent-foreground text-left"
                onClick={subItem.onClick}
              >
                {subItem.icon}
                <div>
                  <div className="text-sm font-semibold">{subItem.title}</div>
                  {subItem.description && (
                    <p className="text-sm leading-snug text-muted-foreground mt-1">
                      {subItem.description}
                    </p>
                  )}
                </div>
              </button>
            )
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  }

  if (item.url) {
    return (
      <Link key={item.title} href={item.url} className="font-semibold flex items-center gap-2 py-3 px-3 rounded-lg hover:bg-muted transition-all duration-200">
        {item.icon}
        <span>{item.title}</span>
      </Link>
    )
  }

  return (
    <button key={item.title} onClick={item.onClick} className="font-semibold flex items-center gap-2 py-3 px-3 rounded-lg hover:bg-muted transition-all duration-200 text-left w-full">
      {item.icon}
      <span>{item.title}</span>
    </button>
  );
};
