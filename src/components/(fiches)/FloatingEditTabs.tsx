import React, { useState } from 'react';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Upload,
    RotateCcw,
    UploadCloud,
    FileDown,
    LayoutDashboard,
    PlusCircle,
    X,
    Palette,
    Layout,
    Compass,
    Send,
    Search,
    User
} from 'lucide-react';
import { ThemeExplorerTab } from './theme-portal/ThemeExplorerTab';
import { ThemePublishTab } from './theme-portal/ThemePublishTab';
import { MyThemesTab } from './theme-portal/MyThemesTab';
import { ThemeConfig } from './theme-portal/types';

interface FloatingEditTabsProps {
    customizationForm: Partial<any>; // Replace 'any' with Character when moved to correct context or imported
    setCustomizationForm: React.Dispatch<React.SetStateAction<Partial<any>>>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'background' | 'block') => Promise<void>;
    handleImportConfig: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleExportConfig: () => void;
    handleResetPositions: () => Promise<void>;
    handleSaveLayout: () => Promise<void>;
    layout: any[];
    WIDGET_REGISTRY: { id: string; label: string; default: any }[];
    isAddWidgetOpen: boolean;
    setIsAddWidgetOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleAddWidget: (widgetId: string) => void;
    onApplyTheme: (config: ThemeConfig) => void;
    onPreviewTheme: (config: ThemeConfig) => void;
    onStopPreview: () => void;
    onClose: () => void;
}

export function FloatingEditTabs({
    customizationForm,
    setCustomizationForm,
    handleImageUpload,
    handleImportConfig,
    handleExportConfig,
    handleResetPositions,
    handleSaveLayout,
    layout,
    WIDGET_REGISTRY,
    isAddWidgetOpen,
    setIsAddWidgetOpen,
    handleAddWidget,
    onApplyTheme,
    onPreviewTheme,
    onStopPreview,
    onClose
}: FloatingEditTabsProps) {
    const [activeTab, setActiveTab] = useState<'apparence' | 'disposition' | 'explorer' | 'mes_themes'>('apparence');
    const [themeConfigInput, setThemeConfigInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[200] bg-[#0e0e0e]/95 backdrop-blur-md border-t border-[#3a3a3a] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out">
            <div className="max-w-7xl mx-auto w-full relative">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'apparence' | 'disposition' | 'explorer' | 'mes_themes')} className="w-full">
                    {/* Tabs List & Actions Header */}
                    <div className="border-b border-[#2a2a2a] px-3 pt-3 bg-[#141414]/50 flex items-end justify-between">
                        <TabsList className="bg-transparent gap-2 h-auto p-0 flex-wrap sm:flex-nowrap">
                            <TabsTrigger
                                value="apparence"
                                className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#d4b48f] text-[#a0a0a0] rounded-t-lg rounded-b-none px-4 py-1.5 text-xs font-bold flex items-center gap-2 border border-transparent data-[state=active]:border-[#3a3a3a] data-[state=active]:border-b-transparent transition-all"
                            >
                                <Palette size={14} /> Apparence
                            </TabsTrigger>
                            <TabsTrigger
                                value="disposition"
                                className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#d4b48f] text-[#a0a0a0] rounded-t-lg rounded-b-none px-4 py-1.5 text-xs font-bold flex items-center gap-2 border border-transparent data-[state=active]:border-[#3a3a3a] data-[state=active]:border-b-transparent transition-all"
                            >
                                <Layout size={14} /> Disposition
                            </TabsTrigger>
                            <TabsTrigger
                                value="explorer"
                                className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#80c0a0] text-[#a0a0a0] rounded-t-lg rounded-b-none px-4 py-1.5 text-xs font-bold flex items-center gap-2 border border-transparent data-[state=active]:border-[#3a3a3a] data-[state=active]:border-b-transparent transition-all"
                            >
                                <Compass size={14} /> Communauté
                            </TabsTrigger>
                            <TabsTrigger
                                value="mes_themes"
                                className="data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#c0a080] text-[#a0a0a0] rounded-t-lg rounded-b-none px-4 py-1.5 text-xs font-bold flex items-center gap-2 border border-transparent data-[state=active]:border-[#3a3a3a] data-[state=active]:border-b-transparent transition-all"
                            >
                                <User size={14} /> Mes thèmes
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2 pb-1.5 pr-1 flex-1 justify-end">
                            {(activeTab === 'explorer' || activeTab === 'mes_themes') && (
                                <>
                                    {activeTab === 'explorer' && (
                                        <div className="hidden sm:flex relative items-center mx-4">
                                            <Search size={14} className="absolute left-2.5 text-[#555]" />
                                            <input
                                                type="text"
                                                placeholder="Rechercher un thème..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="bg-[#1c1c1c] border border-[#3a3a3a] rounded-full py-1 pl-8 pr-3 text-xs text-[#d4d4d4] placeholder-[#555] focus:outline-none focus:border-[#80c0a0] w-[250px] sm:w-[300px] lg:w-[400px] transition-all"
                                            />
                                        </div>
                                    )}

                                    <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                                        <DialogTrigger asChild>
                                            <button className="text-[#80c0a0] hover:text-white hover:bg-[#2a2a2a] px-2 py-1.5 rounded flex items-center gap-1.5 text-xs font-bold transition-all">
                                                <UploadCloud size={14} /> Partager mon thème
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4] max-w-sm p-5 shadow-2xl">
                                            <DialogHeader>
                                                <DialogTitle className="text-[#d4d4d4] text-lg font-bold flex items-center gap-2">
                                                    <UploadCloud size={18} className="text-[#80c0a0]" />
                                                    Partager mon thème
                                                </DialogTitle>
                                            </DialogHeader>
                                            <ThemePublishTab
                                                currentConfig={{ theme: customizationForm as any, layout }}
                                                onSuccess={() => { setIsPublishDialogOpen(false); }}
                                            />
                                        </DialogContent>
                                    </Dialog>
                                    <div className="w-px h-4 bg-[#3a3a3a] mx-1"></div>
                                </>
                            )}
                            <button
                                onClick={handleSaveLayout}
                                className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f] rounded px-3 py-1 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <Send size={12} /> Sauvegarder
                            </button>
                            <button
                                onClick={onClose}
                                className="bg-transparent text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] rounded px-2 py-1 text-xs transition-all flex items-center gap-1"
                            >
                                <X size={12} /> Fermer
                            </button>
                        </div>
                    </div>

                    {/* Tab Contents */}
                    <div className="p-3 sm:p-4 overflow-y-auto" style={{ maxHeight: '35vh' }}>
                        {/* APPARENCE TAB */}
                        <TabsContent value="apparence" className="m-0 focus-visible:outline-none">
                            <div className="flex flex-wrap gap-3 sm:gap-4 items-start">
                                {/* Fond */}
                                <div className="space-y-1.5 flex-grow sm:flex-grow-0 min-w-[140px]">
                                    <span className="text-xs font-bold text-[#d4d4d4] flex items-center gap-1.5"><Palette size={12} className="text-[#a0a0a0]" /> Fond</span>
                                    <div className="flex items-center gap-1 bg-[#1c1c1c] p-1.5 rounded-lg border border-[#3a3a3a]">
                                        <input
                                            type="color"
                                            value={customizationForm.theme_background && !customizationForm.theme_background.startsWith('http') ? customizationForm.theme_background : '#000000'}
                                            onChange={(e) => setCustomizationForm({ ...customizationForm, theme_background: e.target.value })}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                            title="Couleur de fond"
                                        />
                                        <label className="cursor-pointer hover:text-white text-[#a0a0a0] p-1 hover:bg-[#2a2a2a] rounded transition-colors flex-1 flex justify-center items-center gap-1.5 border border-dashed border-[#444]">
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'background')} />
                                            <Upload size={12} /> <span className="text-[10px] uppercase font-bold">Image</span>
                                        </label>
                                        <button
                                            onClick={() => setCustomizationForm({ ...customizationForm, theme_background: '#1c1c1c' })}
                                            className="p-1 hover:bg-red-900/40 rounded text-[#888] hover:text-red-400 transition-colors"
                                            title="Réinitialiser"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Blocs */}
                                <div className="space-y-1.5 flex-grow sm:flex-grow-0 min-w-[140px]">
                                    <span className="text-xs font-bold text-[#d4d4d4] flex items-center gap-1.5"><Layout size={12} className="text-[#a0a0a0]" /> Blocs</span>
                                    <div className="flex items-center gap-1 bg-[#1c1c1c] p-1.5 rounded-lg border border-[#3a3a3a]">
                                        <input
                                            type="color"
                                            value={customizationForm.theme_secondary_color && !customizationForm.theme_secondary_color.startsWith('http') ? customizationForm.theme_secondary_color : '#242424'}
                                            onChange={(e) => setCustomizationForm({ ...customizationForm, theme_secondary_color: e.target.value })}
                                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                            title="Couleur des blocs"
                                        />
                                        <label className="cursor-pointer hover:text-white text-[#a0a0a0] p-1 hover:bg-[#2a2a2a] rounded transition-colors flex-1 flex justify-center items-center gap-1.5 border border-dashed border-[#444]">
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'block')} />
                                            <Upload size={12} /> <span className="text-[10px] uppercase font-bold">Image</span>
                                        </label>
                                        <button
                                            onClick={() => setCustomizationForm({ ...customizationForm, theme_secondary_color: '#242424' })}
                                            className="p-1 hover:bg-red-900/40 rounded text-[#888] hover:text-red-400 transition-colors"
                                            title="Réinitialiser"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Texte Primaire */}
                                <div className="space-y-1.5 flex-grow sm:flex-grow-0 min-w-[120px]">
                                    <span className="text-xs font-bold text-[#d4d4d4]">Texte</span>
                                    <div className="flex items-center gap-1 bg-[#1c1c1c] p-1.5 rounded-lg border border-[#3a3a3a]">
                                        <input
                                            type="color"
                                            value={customizationForm.theme_text_color || '#d4d4d4'}
                                            onChange={(e) => setCustomizationForm({ ...customizationForm, theme_text_color: e.target.value })}
                                            className="w-full h-6 rounded cursor-pointer bg-transparent border-none p-0 flex-1"
                                            title="Couleur du texte"
                                        />
                                        <button
                                            onClick={() => setCustomizationForm({ ...customizationForm, theme_text_color: '#d4d4d4' })}
                                            className="p-1 hover:bg-[#2a2a2a] rounded text-[#888] hover:text-[#a0a0a0] transition-colors flex-shrink-0"
                                            title="Réinitialiser"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Texte Secondaire */}
                                <div className="space-y-1.5 flex-grow sm:flex-grow-0 min-w-[120px]">
                                    <span className="text-xs font-bold text-[#d4d4d4]">Texte Sec.</span>
                                    <div className="flex items-center gap-1 bg-[#1c1c1c] p-1.5 rounded-lg border border-[#3a3a3a]">
                                        <input
                                            type="color"
                                            value={customizationForm.theme_text_secondary_color || '#a0a0a0'}
                                            onChange={(e) => setCustomizationForm({ ...customizationForm, theme_text_secondary_color: e.target.value })}
                                            className="w-full h-6 rounded cursor-pointer bg-transparent border-none p-0 flex-1"
                                            title="Couleur du texte secondaire"
                                        />
                                        <button
                                            onClick={() => setCustomizationForm({ ...customizationForm, theme_text_secondary_color: '#a0a0a0' })}
                                            className="p-1 hover:bg-[#2a2a2a] rounded text-[#888] hover:text-[#a0a0a0] transition-colors flex-shrink-0"
                                            title="Réinitialiser"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Border Radius */}
                                <div className="space-y-1.5 flex-grow sm:flex-grow-0 min-w-[150px]">
                                    <span className="text-xs font-bold text-[#d4d4d4]">Arrondi (px)</span>
                                    <div className="flex items-center gap-2 bg-[#1c1c1c] p-1.5 rounded-lg border border-[#3a3a3a]">
                                        <input
                                            type="range"
                                            min="0"
                                            max="32"
                                            step="2"
                                            value={customizationForm.theme_border_radius ?? 8}
                                            onChange={(e) => setCustomizationForm({ ...customizationForm, theme_border_radius: parseInt(e.target.value, 10) })}
                                            className="w-full cursor-pointer accent-[#d4b48f] h-2"
                                        />
                                        <span className="text-xs font-mono text-[#d4b48f] font-bold w-6 text-right">{customizationForm.theme_border_radius ?? 8}</span>
                                        <button
                                            onClick={() => setCustomizationForm({ ...customizationForm, theme_border_radius: 8 })}
                                            className="p-1 hover:bg-[#2a2a2a] rounded text-[#888] hover:text-[#a0a0a0] transition-colors"
                                            title="Réinitialiser"
                                        >
                                            <RotateCcw size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* DISPOSITION TAB */}
                        <TabsContent value="disposition" className="m-0 focus-visible:outline-none">
                            <div className="flex flex-col sm:flex-row items-center gap-3 flex-wrap">
                                <div className="flex gap-2 p-2 bg-[#1c1c1c] border border-[#3a3a3a] rounded-lg">
                                    {/* Add Widget Dialog */}
                                    <Dialog open={isAddWidgetOpen} onOpenChange={setIsAddWidgetOpen}>
                                        <DialogTrigger asChild>
                                            <button className="bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#d4d4d4] px-3 py-1.5 rounded flex items-center justify-center gap-2 text-xs font-bold border border-[#4a4a4a] transition-all">
                                                <PlusCircle size={14} /> Ajouter
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] max-w-sm p-4">
                                            <DialogHeader>
                                                <DialogTitle className="text-[#c0a080]">Ajouter un widget</DialogTitle>
                                            </DialogHeader>
                                            <div className="grid gap-2 mt-2">
                                                {WIDGET_REGISTRY.filter(w => !layout.find(l => l.i === w.id)).length > 0 ? (
                                                    WIDGET_REGISTRY.filter(w => !layout.find(l => l.i === w.id)).map(widget => (
                                                        <button
                                                            key={widget.id}
                                                            onClick={() => handleAddWidget(widget.id)}
                                                            className="w-full text-left px-3 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-lg text-sm font-bold text-[#d4d4d4] hover:text-[#fff] transition-colors border border-[#444] flex items-center justify-between"
                                                        >
                                                            {widget.label}
                                                            <PlusCircle size={14} className="opacity-50" />
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-3 text-center text-[#888] text-sm italic bg-[#1c1c1c] rounded-lg">
                                                        Tous les widgets sont déjà présents sur la fiche.
                                                    </div>
                                                )}
                                            </div>
                                        </DialogContent>
                                    </Dialog>

                                    <button
                                        onClick={handleResetPositions}
                                        className="bg-red-900/40 text-red-200 border border-red-900/60 hover:bg-red-900/60 px-3 py-1.5 rounded transition text-xs font-bold flex items-center justify-center gap-2"
                                        title="Réinitialiser la disposition"
                                    >
                                        <LayoutDashboard size={14} /> Réinitialiser
                                    </button>
                                </div>

                                <div className="h-6 w-px bg-[#3a3a3a] hidden sm:block mx-1"></div>

                                <div className="flex gap-2 p-2 bg-[#1c1c1c] border border-[#3a3a3a] rounded-lg">
                                    <label className="cursor-pointer bg-blue-900/40 text-blue-200 border border-blue-900/60 hover:bg-blue-900/60 px-3 py-1.5 rounded transition text-xs font-bold flex items-center justify-center gap-2">
                                        <input type="file" className="hidden" accept=".json" onChange={handleImportConfig} />
                                        <UploadCloud size={14} /> Importer
                                    </label>

                                    <button
                                        onClick={handleExportConfig}
                                        className="bg-green-900/40 text-green-200 border border-green-900/60 hover:bg-green-900/60 px-3 py-1.5 rounded transition text-xs font-bold flex items-center justify-center gap-2"
                                        title="Exporter le thème"
                                    >
                                        <FileDown size={14} /> Exporter
                                    </button>
                                </div>
                            </div>
                        </TabsContent>

                        {/* EXPLORER TAB */}
                        <TabsContent value="explorer" className="m-0 focus-visible:outline-none flex flex-col gap-2 relative">
                            <div className="sm:hidden mb-2 relative flex items-center">
                                <Search size={14} className="absolute left-2.5 text-[#555]" />
                                <input
                                    type="text"
                                    placeholder="Rechercher un thème..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-[#1c1c1c] border border-[#3a3a3a] rounded-full py-1 pl-8 pr-3 text-xs text-[#d4d4d4] placeholder-[#555] focus:outline-none focus:border-[#80c0a0] w-full transition-all"
                                />
                            </div>
                            <ThemeExplorerTab
                                searchQuery={searchQuery}
                                onApplyTheme={(config) => {
                                    onApplyTheme(config);
                                }}
                                onPreviewTheme={onPreviewTheme}
                                onStopPreview={onStopPreview}
                            />
                        </TabsContent>

                        {/* MES THEMES TAB */}
                        <TabsContent value="mes_themes" className="m-0 focus-visible:outline-none flex flex-col gap-2 relative">
                            <MyThemesTab
                                onApplyTheme={(config) => {
                                    onApplyTheme(config);
                                }}
                                onPreviewTheme={onPreviewTheme}
                                onStopPreview={onStopPreview}
                                currentConfig={{ theme: customizationForm as any, layout }}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div >
    );
}
