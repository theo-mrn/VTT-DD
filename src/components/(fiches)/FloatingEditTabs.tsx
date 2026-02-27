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
    User,
    Sliders,
    Trash2,
    Plus
} from 'lucide-react';
import { ThemeExplorerTab } from './theme-portal/ThemeExplorerTab';
import { ThemePublishTab } from './theme-portal/ThemePublishTab';
import { MyThemesTab } from './theme-portal/MyThemesTab';
import { ThemeConfig } from './theme-portal/types';
import { useCharacter, CustomField } from '@/contexts/CharacterContext';

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

    // ── Character Sheet Hooks ─────────────────────────────
    const { selectedCharacter, updateCharacter } = useCharacter();

    return (
        <>
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
                                                <button className="text-[var(--accent-brown)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-darker)] px-2 py-1.5 rounded flex items-center gap-1.5 text-xs font-bold transition-all">
                                                    <UploadCloud size={14} /> Partager mon thème
                                                </button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] max-w-sm p-5 shadow-2xl">
                                                <DialogHeader>
                                                    <DialogTitle className="text-[var(--text-primary)] text-lg font-bold flex items-center gap-2">
                                                        <UploadCloud size={18} className="text-[var(--accent-brown)]" />
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
                                <div className="w-px h-4 bg-[#3a3a3a] mx-0.5" />
                                <button
                                    onClick={handleSaveLayout}
                                    className="button-primary !px-3 !py-1 !text-xs shadow-sm flex items-center gap-1.5"
                                >
                                    <Send size={12} /> Sauvegarder
                                </button>
                                <button
                                    onClick={onClose}
                                    className="bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-darker)] rounded px-2 py-1 text-xs transition-all flex items-center gap-1"
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
                                                <button className="button-cancel !px-3 !py-1.5 !text-xs !flex !items-center !justify-center gap-2 transition-all">
                                                    <PlusCircle size={14} /> Ajouter
                                                </button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] max-w-sm p-4">
                                                <DialogHeader>
                                                    <DialogTitle className="text-[var(--accent-brown)]">Ajouter un widget</DialogTitle>
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
                                        <label className="cursor-pointer button-secondary !px-3 !py-1.5 !text-xs !flex !items-center !justify-center gap-2">
                                            <input type="file" className="hidden" accept=".json" onChange={handleImportConfig} />
                                            <UploadCloud size={14} /> Importer
                                        </label>

                                        <button
                                            onClick={handleExportConfig}
                                            className="button-primary !px-3 !py-1.5 !text-xs !flex !items-center !justify-center gap-2"
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
                </div >
            </div >

        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone Attributs Dialog — usable outside FloatingEditTabs
// ─────────────────────────────────────────────────────────────────────────────
export function AttributsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const { selectedCharacter, updateCharacter } = useCharacter();
    const customFields: CustomField[] = selectedCharacter?.customFields ?? [];
    const statRollable: Record<string, boolean> = selectedCharacter?.statRollable ?? {};

    const BUILTIN_STATS = [
        { key: 'FOR', label: 'FOR', hasModifier: true },
        { key: 'DEX', label: 'DEX', hasModifier: true },
        { key: 'CON', label: 'CON', hasModifier: true },
        { key: 'SAG', label: 'SAG', hasModifier: true },
        { key: 'INT', label: 'INT', hasModifier: true },
        { key: 'CHA', label: 'CHA', hasModifier: true },
        { key: 'Defense', label: 'Défense', hasModifier: false },
        { key: 'Contact', label: 'Contact', hasModifier: false },
        { key: 'Magie', label: 'Magie', hasModifier: false },
        { key: 'Distance', label: 'Distance', hasModifier: false },
        { key: 'INIT', label: 'INIT', hasModifier: false },
    ];
    const defaultRollable: Record<string, boolean> = { FOR: true, DEX: true, CON: true, SAG: true, INT: true, CHA: true, Defense: false, Contact: false, Magie: false, Distance: false, INIT: false };
    const isStatRollable = (key: string) => key in statRollable ? statRollable[key] : defaultRollable[key] ?? false;
    const handleToggleStatRollable = async (key: string) => {
        if (!selectedCharacter) return;
        await updateCharacter(selectedCharacter.id, { statRollable: { ...statRollable, [key]: !isStatRollable(key) } });
    };

    const emptyDraft = (): Omit<CustomField, 'id'> => ({ label: '', type: 'number', value: 0, isRollable: false, hasModifier: false });
    const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [fieldDraft, setFieldDraft] = useState<Omit<CustomField, 'id'>>(emptyDraft());
    const [isSavingField, setIsSavingField] = useState(false);

    const openNewFieldDialog = () => { setEditingFieldId(null); setFieldDraft(emptyDraft()); setIsFieldDialogOpen(true); };
    const openEditFieldDialog = (field: CustomField) => {
        setEditingFieldId(field.id);
        setFieldDraft({ label: field.label, type: field.type, value: field.value, isRollable: field.isRollable ?? false, hasModifier: field.hasModifier ?? false });
        setIsFieldDialogOpen(true);
    };
    const handleSaveField = async () => {
        if (!fieldDraft.label.trim() || !selectedCharacter) return;
        setIsSavingField(true);
        try {
            if (editingFieldId) {
                await updateCharacter(selectedCharacter.id, { customFields: customFields.map(f => f.id === editingFieldId ? { ...f, ...fieldDraft } : f) });
            } else {
                const newField: CustomField = { id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...fieldDraft };
                await updateCharacter(selectedCharacter.id, { customFields: [...customFields, newField] });
            }
            setIsFieldDialogOpen(false);
        } finally { setIsSavingField(false); }
    };
    const handleDeleteField = async (id: string) => {
        if (!selectedCharacter) return;
        await updateCharacter(selectedCharacter.id, { customFields: customFields.filter(f => f.id !== id) });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] max-w-md p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--border-color)]">
                        <DialogTitle className="text-[var(--accent-brown)] font-bold flex items-center gap-2">
                            <Sliders size={16} /> Champs &amp; Attributs
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-darker)] border-b border-[var(--border-color)]">
                                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Attributs de base</span>
                                <span className="text-[10px] text-[var(--text-secondary)] italic">Valeur · Mod · Dés</span>
                            </div>
                            {BUILTIN_STATS.map((stat, i) => {
                                const val = Number(selectedCharacter?.[stat.key] ?? 10);
                                const mod = stat.hasModifier ? Math.floor((val - 10) / 2) : null;
                                const rollable = isStatRollable(stat.key);
                                return (
                                    <div key={stat.key} className={`flex items-center gap-3 px-4 py-2.5 ${i < BUILTIN_STATS.length - 1 ? 'border-b border-[var(--border-color)]' : ''} hover:bg-[var(--bg-dark)] transition-colors`}>
                                        <span className="w-20 text-sm font-bold text-[var(--text-primary)]">{stat.label}</span>
                                        <span className="w-10 text-sm font-mono text-[var(--text-primary)] text-center">{val}</span>
                                        {mod !== null ? <span className="w-10 text-xs font-mono text-[var(--accent-brown)] text-center">{mod >= 0 ? `+${mod}` : mod}</span> : <span className="w-10" />}
                                        <div className="flex-1" />
                                        <button onClick={() => handleToggleStatRollable(stat.key)} className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-all ${rollable ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)]' : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--accent-brown)]'}`}>Dés</button>
                                    </div>
                                );
                            })}
                            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-darker)] border-t border-[var(--border-color)]">
                                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Attributs personnalisés</span>
                                <button onClick={openNewFieldDialog} className="button-primary !px-2.5 !py-1 !text-xs flex items-center gap-1"><Plus size={11} /> Ajouter</button>
                            </div>
                            {customFields.length === 0 ? (
                                <div className="px-4 py-5 text-sm text-[var(--text-secondary)] italic text-center">Aucun attribut personnalisé.</div>
                            ) : (
                                customFields.map((field, i) => (
                                    <div key={field.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < customFields.length - 1 ? 'border-b border-[var(--border-color)]' : ''} hover:bg-[var(--bg-dark)] transition-colors cursor-pointer group`} onClick={() => openEditFieldDialog(field)}>
                                        <span className="w-24 text-sm font-bold truncate text-[var(--text-primary)]">{field.label}</span>
                                        <span className="w-10 text-sm font-mono text-[var(--text-primary)] text-center">{field.type === 'boolean' ? (field.value ? 'Oui' : 'Non') : field.type === 'percent' ? `${field.value}%` : String(field.value)}</span>
                                        {field.hasModifier && field.type === 'number' ? <span className="w-10 text-xs font-mono text-[var(--accent-brown)] text-center">{(() => { const m = Math.floor((Number(field.value) - 10) / 2); return m >= 0 ? `+${m}` : m; })()}</span> : <span className="w-10" />}
                                        <span className="text-[10px] font-mono px-1 rounded border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-secondary)]">{field.type === 'number' ? '123' : field.type === 'percent' ? '%' : field.type === 'boolean' ? 'Bool' : 'Aa'}</span>
                                        {field.isRollable && <span className="text-[10px] font-bold text-[var(--accent-brown)]">Dés</span>}
                                        {field.hasModifier && <span className="text-[10px] text-[var(--text-secondary)]">Mod</span>}
                                        <div className="flex-1" />
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id); }} className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Field edit/create dialog */}
            <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
                <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] max-w-md p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--border-color)]">
                        <DialogTitle className="text-[var(--accent-brown)] font-bold flex items-center gap-2">
                            <Sliders size={16} /> {editingFieldId ? "Modifier l'attribut" : 'Nouvel attribut'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="px-5 py-4 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Nom</label>
                            <input type="text" placeholder="ex: Durabilité, Honneur..." value={fieldDraft.label} onChange={(e) => setFieldDraft(d => ({ ...d, label: e.target.value }))} autoFocus className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[#555] focus:outline-none focus:border-[var(--accent-brown)] transition-colors" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Type</label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {([{ value: 'number', label: '123', desc: 'Nombre' }, { value: 'percent', label: '%', desc: 'Pourcentage' }, { value: 'text', label: 'Aa', desc: 'Texte' }, { value: 'boolean', label: '✓/✗', desc: 'Booléen' }] as const).map((opt) => (
                                    <button key={opt.value} onClick={() => setFieldDraft(d => ({ ...d, type: opt.value, value: opt.value === 'number' ? 0 : opt.value === 'percent' ? 0 : opt.value === 'boolean' ? false : '' }))} className={`py-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition-all ${fieldDraft.type === opt.value ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)]' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--accent-brown)]'}`}>
                                        <span className="text-base">{opt.label}</span>
                                        <span className="text-[9px] opacity-70">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Valeur par défaut</label>
                            {fieldDraft.type === 'boolean' ? (
                                <div className="flex gap-2">
                                    {[{ v: false, l: '✗ Non' }, { v: true, l: '✓ Oui' }].map(({ v, l }) => (
                                        <button key={String(v)} onClick={() => setFieldDraft(d => ({ ...d, value: v }))} className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${fieldDraft.value === v ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)]' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>{l}</button>
                                    ))}
                                </div>
                            ) : fieldDraft.type === 'percent' ? (
                                <div className="flex items-center gap-2"><input type="number" min={0} max={100} value={Number(fieldDraft.value)} onChange={(e) => setFieldDraft(d => ({ ...d, value: Number(e.target.value) }))} className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-brown)] transition-colors text-[var(--text-primary)]" /><span className="text-sm text-[var(--text-secondary)]">%</span></div>
                            ) : (
                                <input type={fieldDraft.type === 'number' ? 'number' : 'text'} value={String(fieldDraft.value)} onChange={(e) => setFieldDraft(d => ({ ...d, value: fieldDraft.type === 'number' ? Number(e.target.value) : e.target.value }))} className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-brown)] transition-colors" />
                            )}
                        </div>
                        {fieldDraft.type === 'number' && (
                            <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-dark)] cursor-pointer hover:border-[var(--accent-brown)] transition-colors">
                                <input type="checkbox" checked={!!fieldDraft.hasModifier} onChange={(e) => setFieldDraft(d => ({ ...d, hasModifier: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[var(--accent-brown)] cursor-pointer flex-shrink-0" />
                                <div><p className="text-sm font-bold text-[var(--text-primary)]">Modificateur</p><p className="text-xs text-[var(--text-secondary)] mt-0.5">Affiche ⌊(val−10)/2⌋ en supplément.</p></div>
                            </label>
                        )}
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-dark)] cursor-pointer hover:border-[var(--accent-brown)] transition-colors">
                            <input type="checkbox" checked={!!fieldDraft.isRollable} onChange={(e) => setFieldDraft(d => ({ ...d, isRollable: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[var(--accent-brown)] cursor-pointer flex-shrink-0" />
                            <div><p className="text-sm font-bold text-[var(--text-primary)]">Sujet aux dés</p><p className="text-xs text-[var(--text-secondary)] mt-0.5">Utilisable comme bonus dans le lanceur.</p></div>
                        </label>
                    </div>
                    <div className="px-5 pb-5 flex gap-2 justify-end border-t border-[var(--border-color)] pt-4">
                        <button onClick={() => setIsFieldDialogOpen(false)} className="button-cancel !px-4 !py-2 !text-sm">Annuler</button>
                        <button onClick={handleSaveField} disabled={!fieldDraft.label.trim() || isSavingField} className="button-primary !px-4 !py-2 !text-sm disabled:opacity-50">
                            {isSavingField ? 'Enregistrement...' : editingFieldId ? 'Enregistrer' : 'Créer le champ'}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
