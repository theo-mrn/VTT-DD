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
            className="h-screen w-full bg-[#121212] text-[#d4d4d4] font-papyrus flex flex-row overflow-hidden"
            style={{
                backgroundImage: "url('/assets/bg.jpg')",
                backgroundAttachment: 'fixed',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            <Tabs defaultValue="bestiaire" orientation="vertical" className="flex-1 flex flex-row h-full w-full">
                
                {/* Sidebar */}
                <TabsList className="flex flex-col justify-center items-center gap-8 bg-black/80 backdrop-blur-2xl w-16 h-full rounded-none border-r border-white/10 z-50 py-8">
                    <TabsTrigger
                        value="bestiaire"
                        title="Bestiaire"
                        className="p-3 rounded-xl data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/60 hover:text-[#c0a080] transition-all hover:bg-[#c0a080]/10 data-[state=active]:shadow-[0_0_15px_rgba(192,160,128,0.3)] shadow-none border-none"
                    >
                        <Skull className="w-6 h-6" />
                    </TabsTrigger>
                    
                    <TabsTrigger
                        value="capacites"
                        title="Capacités"
                        className="p-3 rounded-xl data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/60 hover:text-[#c0a080] transition-all hover:bg-[#c0a080]/10 data-[state=active]:shadow-[0_0_15px_rgba(192,160,128,0.3)] shadow-none border-none"
                    >
                        <Zap className="w-6 h-6" />
                    </TabsTrigger>

                    <TabsTrigger
                        value="images"
                        title="Images"
                        className="p-3 rounded-xl data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/60 hover:text-[#c0a080] transition-all hover:bg-[#c0a080]/10 data-[state=active]:shadow-[0_0_15px_rgba(192,160,128,0.3)] shadow-none border-none"
                    >
                        <ImageIcon className="w-6 h-6" />
                    </TabsTrigger>

                    <TabsTrigger
                        value="marche"
                        title="Marché"
                        className="p-3 rounded-xl data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/60 hover:text-[#c0a080] transition-all hover:bg-[#c0a080]/10 data-[state=active]:shadow-[0_0_15px_rgba(192,160,128,0.3)] shadow-none border-none"
                    >
                        <Store className="w-6 h-6" />
                    </TabsTrigger>
                </TabsList>

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto bg-black/40 backdrop-blur-sm h-full relative">
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
