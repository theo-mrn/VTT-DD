'use client'

import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImageIcon, Store, Zap, Skull } from "lucide-react"
import Marketplace from "@/components/(infos)/Information"
import Capacites from "@/components/(infos)/capacites"
import Images from "@/components/(infos)/images"
import Glossary from "@/components/(infos)/Glossary"

export default function RessourcesPage() {
    return (
        <div
            className="min-h-screen bg-[#121212] text-[#d4d4d4] font-papyrus overflow-hidden flex flex-col"
            style={{
                backgroundImage: "url('/assets/bg.jpg')",
                backgroundAttachment: 'fixed',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            <Tabs defaultValue="bestiaire" className="w-full flex-1 flex flex-col">
                <TabsList className="flex w-full justify-start gap-4 bg-black/80 backdrop-blur-2xl p-3 h-auto rounded-none border-b border-white/10 sticky top-0 z-50 overflow-x-auto no-scrollbar">
                    <TabsTrigger
                        value="bestiaire"
                        className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70 hover:text-[#c0a080] rounded-md transition-all text-sm font-bold uppercase tracking-widest border border-[#c0a080]/20 data-[state=active]:border-white/40 shadow-sm"
                    >
                        <Skull className="w-4 h-4" />
                        <span>Bestiaire</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="capacites"
                        className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70 hover:text-[#c0a080] rounded-md transition-all text-sm font-bold uppercase tracking-widest border border-[#c0a080]/20 data-[state=active]:border-white/40 shadow-sm"
                    >
                        <Zap className="w-4 h-4" />
                        <span>Capacités</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="images"
                        className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70 hover:text-[#c0a080] rounded-md transition-all text-sm font-bold uppercase tracking-widest border border-[#c0a080]/20 data-[state=active]:border-white/40 shadow-sm"
                    >
                        <ImageIcon className="w-4 h-4" />
                        <span>Images</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="marche"
                        className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70 hover:text-[#c0a080] rounded-md transition-all text-sm font-bold uppercase tracking-widest border border-[#c0a080]/20 data-[state=active]:border-white/40 shadow-sm"
                    >
                        <Store className="w-4 h-4" />
                        <span>Marché</span>
                    </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto bg-black/40 backdrop-blur-sm">
                    <TabsContent value="bestiaire" className="mt-0 outline-none min-h-full">
                        <Glossary />
                    </TabsContent>

                    <TabsContent value="capacites" className="mt-0 outline-none min-h-full">
                        <Capacites />
                    </TabsContent>

                    <TabsContent value="images" className="mt-0 outline-none min-h-full">
                        <Images />
                    </TabsContent>

                    <TabsContent value="marche" className="mt-0 outline-none min-h-full">
                        <Marketplace />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
