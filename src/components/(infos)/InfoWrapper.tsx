import React, { useState } from 'react';
import { X } from 'lucide-react';
import InfoComponent, { type InfoSection } from './info';

interface InfoWrapperProps {
    onClose: () => void;
}

export function InfoComponentWrapper({ onClose }: InfoWrapperProps) {
    const [activeSection, setActiveSection] = useState<InfoSection>(null);

    return (
        <>
            {!activeSection && (
                <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-40 bg-[#242424] rounded-lg shadow-lg border border-[#3a3a3a] p-2 pointer-events-auto">
                    <button
                        onClick={onClose}
                        className="absolute -top-2 -right-2 rounded-full p-1 bg-[#1c1c1c] text-[#d4d4d4] hover:bg-[#333] transition-colors shadow-lg border border-[#3a3a3a] z-10"
                        aria-label="Fermer"
                    >
                        <X className="h-3 w-3" />
                    </button>
                    <InfoComponent activeSection={activeSection} setActiveSection={setActiveSection} renderButtons={true} />
                </div>
            )}
            <InfoComponent activeSection={activeSection} setActiveSection={setActiveSection} renderButtons={false} />
        </>
    );
}
