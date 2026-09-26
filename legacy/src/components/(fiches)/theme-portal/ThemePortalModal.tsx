import React, { useState } from 'react';
import { Globe, UploadCloud, X, Compass } from 'lucide-react';
import { ThemeExplorerTab } from './ThemeExplorerTab';
import { ThemePublishTab } from './ThemePublishTab';
import { ThemeConfig, ThemeValues } from './types';

interface ThemePortalModalProps {
    currentConfig: ThemeConfig;
    onApplyTheme: (config: ThemeConfig) => void;
    onPreviewTheme: (config: ThemeConfig) => void;
    onStopPreview: () => void;
}

export function ThemePortalModal({ currentConfig, onApplyTheme, onPreviewTheme, onStopPreview }: ThemePortalModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'explore' | 'publish'>('explore');

    const handleClose = () => {
        onStopPreview();
        setIsOpen(false);
    };

    const handleApplyWrapper = (config: ThemeConfig) => {
        onApplyTheme(config);
        onStopPreview();
        setIsOpen(false);
    };

    const handlePublishSuccess = () => {
        setActiveTab('explore');
    };

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-indigo-900/50 text-indigo-200 border border-indigo-900 px-2 py-1.5 rounded hover:bg-indigo-900/80 transition text-xs font-bold flex items-center gap-1"
                title="Portail de Thèmes Communautaires"
            >
                <Globe size={14} />
                <span className="hidden sm:inline">Communauté</span>
            </button>

            {/* Bottom floating bar */}
            <div
                className={`fixed bottom-0 left-0 right-0 z-[200] bg-[#0e0e0e]/95 backdrop-blur-sm border-t border-[#3a3a3a] shadow-2xl transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                style={{ maxHeight: '44vh' }}
            >
                {/* Bar header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a]">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Globe size={16} className="text-[#d4b48f]" />
                            <span className="text-sm font-bold text-[#d4d4d4]">Thèmes Communautaires</span>
                            <span className="text-[11px] text-[#555] hidden sm:inline">— Survolez pour prévisualiser sur votre fiche</span>
                        </div>

                        {/* Inline tabs */}
                        <div className="flex gap-1 ml-4">
                            <button
                                onClick={() => setActiveTab('explore')}
                                className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${activeTab === 'explore'
                                    ? 'bg-[#d4b48f]/20 text-[#d4b48f] border border-[#d4b48f]/30'
                                    : 'text-[#666] hover:text-[#a0a0a0]'
                                    }`}
                            >
                                <Compass size={13} /> Explorer
                            </button>
                            <button
                                onClick={() => setActiveTab('publish')}
                                className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${activeTab === 'publish'
                                    ? 'bg-[#d4b48f]/20 text-[#d4b48f] border border-[#d4b48f]/30'
                                    : 'text-[#666] hover:text-[#a0a0a0]'
                                    }`}
                            >
                                <UploadCloud size={13} /> Publier
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded hover:bg-[#2a2a2a] text-[#555] hover:text-[#d4d4d4] transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content area */}
                <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(44vh - 46px)' }}>
                    {activeTab === 'explore' ? (
                        <ThemeExplorerTab
                            onApplyTheme={handleApplyWrapper}
                            onPreviewTheme={onPreviewTheme}
                            onStopPreview={onStopPreview}
                        />
                    ) : (
                        <ThemePublishTab
                            currentConfig={currentConfig}
                            onSuccess={handlePublishSuccess}
                        />
                    )}
                </div>
            </div>
        </>
    );
}
