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
    Plus,
    Box
} from 'lucide-react';
import { ThemeExplorerTab } from './theme-portal/ThemeExplorerTab';
import { ThemePublishTab } from './theme-portal/ThemePublishTab';
import { MyThemesTab } from './theme-portal/MyThemesTab';
import { ThemeConfig } from './theme-portal/types';
import { useCharacter, CustomField } from '@/contexts/CharacterContext';
import { WidgetCustomGroup, GroupCreationSection } from './FicheWidgets';

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
    const [activeTab, setActiveTab] = useState<'apparence' | 'bloques' | 'explorer' | 'mes_themes'>('apparence');
    const [themeConfigInput, setThemeConfigInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

    // ── Character Sheet Hooks ─────────────────────────────
    const { selectedCharacter, updateCharacter } = useCharacter();

    return (
        <div className="fixed right-0 top-0 bottom-0 z-[200] bg-[#0e0e0e]/95 backdrop-blur-md border-l border-[#3a3a3a] shadow-[-20px_0_50px_-10px_rgba(0,0,0,0.6)] transition-all duration-300 ease-in-out w-full sm:w-[260px]">
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex flex-col h-full w-full">
                {/* Header & Horizontal Tabs Wrapper */}
                <div className="shrink-0 bg-[#141414] border-b border-[#2a2a2a]">
                    {/* Header with Actions */}
                    <div className="p-4 pb-2 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col min-w-0">
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#666]">Éditeur</h2>
                                <span className="text-[10px] font-bold text-[#d4b48f] truncate block">
                                    {activeTab === 'apparence' && 'Personnalisation'}
                                    {activeTab === 'bloques' && 'Blocs de données'}
                                    {activeTab === 'explorer' && 'Commu'}
                                    {activeTab === 'mes_themes' && 'Library'}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="bg-[#2a2a2a] text-[#a0a0a0] hover:text-white rounded-lg p-1.5 transition-all hover:bg-[#333]"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <button
                            onClick={handleSaveLayout}
                            className="button-primary !w-full !py-2 !text-[10px] shadow-sm flex items-center justify-center gap-1.5 uppercase font-black tracking-wide"
                        >
                            <Send size={12} /> Sauver
                        </button>
                    </div>

                    {/* Horizontal Tabs List */}
                    <TabsList className="bg-transparent h-auto p-0 px-4 flex justify-between gap-0 overflow-x-auto custom-scrollbar-hide rounded-none">
                        <TabsTrigger
                            value="apparence"
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#d4b48f] text-[#666] p-0 pb-3 h-auto rounded-none border-b-2 border-transparent data-[state=active]:border-[#d4b48f] transition-all flex items-center justify-center flex-1"
                        >
                            <Palette size={16} />
                        </TabsTrigger>
                        <TabsTrigger
                            value="bloques"
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#d4b48f] text-[#666] p-0 pb-3 h-auto rounded-none border-b-2 border-transparent data-[state=active]:border-[#d4b48f] transition-all flex items-center justify-center flex-1"
                        >
                            <Box size={16} />
                        </TabsTrigger>
                        <TabsTrigger
                            value="explorer"
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#80c0a0] text-[#666] p-0 pb-3 h-auto rounded-none border-b-2 border-transparent data-[state=active]:border-[#80c0a0] transition-all flex items-center justify-center flex-1"
                        >
                            <Compass size={16} />
                        </TabsTrigger>
                        <TabsTrigger
                            value="mes_themes"
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-[#c0a080] text-[#666] p-0 pb-3 h-auto rounded-none border-b-2 border-transparent data-[state=active]:border-[#c0a080] transition-all flex items-center justify-center flex-1"
                        >
                            <User size={16} />
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/20">
                    {/* APPARENCE TAB */}
                    <TabsContent value="apparence" className="m-0 focus-visible:outline-none space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                        {/* Fond */}
                        <section className="space-y-3">
                            <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Arrière-plan</span>
                            <div className="bg-[#1c1c1c] p-3 rounded-xl border border-[#2a2a2a] space-y-3">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={customizationForm.theme_background && !customizationForm.theme_background.startsWith('http') ? customizationForm.theme_background : '#000000'}
                                        onChange={(e) => setCustomizationForm({ ...customizationForm, theme_background: e.target.value })}
                                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                        title="Couleur de fond"
                                    />
                                    <div className="flex-1 text-[10px] text-[#888] font-medium leading-tight">Couleur principale du fond de la fiche.</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="cursor-pointer hover:bg-[#2a2a2a] text-[#d4d4d4] p-2 rounded-lg transition-colors flex-1 flex justify-center items-center gap-2 border border-dashed border-[#444] group">
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'background')} />
                                        <UploadCloud size={14} className="group-hover:text-[#d4b48f]" /> <span className="text-[10px] uppercase font-bold">Importer Image</span>
                                    </label>
                                    <button
                                        onClick={() => setCustomizationForm({ ...customizationForm, theme_background: '#1c1c1c' })}
                                        className="p-2 bg-[#2a2a2a] hover:bg-red-900/40 rounded-lg text-[#888] hover:text-red-400 transition-colors"
                                        title="Réinitialiser"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Blocs */}
                        <section className="space-y-3">
                            <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Conteneurs & Blocs</span>
                            <div className="bg-[#1c1c1c] p-3 rounded-xl border border-[#2a2a2a] space-y-3">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={customizationForm.theme_secondary_color && !customizationForm.theme_secondary_color.startsWith('http') ? customizationForm.theme_secondary_color : '#242424'}
                                        onChange={(e) => setCustomizationForm({ ...customizationForm, theme_secondary_color: e.target.value })}
                                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                        title="Couleur des blocs"
                                    />
                                    <div className="flex-1 text-[10px] text-[#888] font-medium leading-tight">Style des widgets et sections de la fiche.</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="cursor-pointer hover:bg-[#2a2a2a] text-[#d4d4d4] p-2 rounded-lg transition-colors flex-1 flex justify-center items-center gap-2 border border-dashed border-[#444] group">
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'block')} />
                                        <UploadCloud size={14} className="group-hover:text-[#d4b48f]" /> <span className="text-[10px] uppercase font-bold">Importer Image</span>
                                    </label>
                                    <button
                                        onClick={() => setCustomizationForm({ ...customizationForm, theme_secondary_color: '#242424' })}
                                        className="p-2 bg-[#2a2a2a] hover:bg-red-900/40 rounded-lg text-[#888] hover:text-red-400 transition-colors"
                                        title="Réinitialiser"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Typographie & Bordures */}
                        <section className="space-y-3">
                            <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Détails Visuels</span>
                            <div className="bg-[#1c1c1c] p-4 rounded-xl border border-[#2a2a2a] space-y-5">
                                {/* Texte */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-[#d4d4d4]">Texte Principal</span>
                                        <button onClick={() => setCustomizationForm({ ...customizationForm, theme_text_color: '#d4d4d4' })} className="text-[#666] hover:text-[#d4b48f] transition-colors"><RotateCcw size={12} /></button>
                                    </div>
                                    <input
                                        type="color"
                                        value={customizationForm.theme_text_color || '#d4d4d4'}
                                        onChange={(e) => setCustomizationForm({ ...customizationForm, theme_text_color: e.target.value })}
                                        className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-none p-0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-[#d4d4d4]">Texte Secondaire</span>
                                        <button onClick={() => setCustomizationForm({ ...customizationForm, theme_text_secondary_color: '#a0a0a0' })} className="text-[#666] hover:text-[#d4b48f] transition-colors"><RotateCcw size={12} /></button>
                                    </div>
                                    <input
                                        type="color"
                                        value={customizationForm.theme_text_secondary_color || '#a0a0a0'}
                                        onChange={(e) => setCustomizationForm({ ...customizationForm, theme_text_secondary_color: e.target.value })}
                                        className="w-full h-8 rounded-lg cursor-pointer bg-transparent border-none p-0"
                                    />
                                </div>
                                {/* Border Radius */}
                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-[#d4d4d4]">Arrondi des angles</span>
                                        <span className="text-[11px] font-mono text-[#d4b48f] font-bold">{customizationForm.theme_border_radius ?? 8}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="32"
                                        step="2"
                                        value={customizationForm.theme_border_radius ?? 8}
                                        onChange={(e) => setCustomizationForm({ ...customizationForm, theme_border_radius: parseInt(e.target.value, 10) })}
                                        className="w-full cursor-pointer accent-[#d4b48f] h-1.5 bg-[#2a2a2a] rounded-lg appearance-none"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Fiche & Config */}
                        <section className="space-y-3 pt-2">
                            <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Configuration</span>
                            <div className="bg-[#1c1c1c] p-3 rounded-xl border border-[#2a2a2a] space-y-2">
                                <button
                                    onClick={handleResetPositions}
                                    className="w-full flex items-center gap-3 p-2.5 bg-[#2a2a2a] hover:bg-red-900/10 border border-transparent hover:border-red-900/30 rounded-lg transition-all text-[#a0a0a0] hover:text-red-200"
                                >
                                    <RotateCcw size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Reset Disposition</span>
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-center gap-2 p-2.5 bg-[#2a2a2a] hover:bg-[#333] border border-transparent hover:border-[#80c0a0]/30 rounded-lg transition-all cursor-pointer group text-[#a0a0a0] hover:text-white">
                                        <input type="file" className="hidden" accept=".json" onChange={handleImportConfig} />
                                        <Upload size={14} className="text-[#80c0a0]" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Import</span>
                                    </label>
                                    <button
                                        onClick={handleExportConfig}
                                        className="flex items-center justify-center gap-2 p-2.5 bg-[#2a2a2a] hover:bg-[#333] border border-transparent hover:border-[#c0a080]/30 rounded-lg transition-all text-[#a0a0a0] hover:text-white"
                                    >
                                        <FileDown size={14} className="text-[#c0a080]" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Export</span>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </TabsContent>

                    {/* BLOQUES TAB */}
                    <TabsContent value="bloques" className="m-0 focus-visible:outline-none space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                        <section className="space-y-3">
                            <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Attributs de base</span>
                            <div className="grid grid-cols-1 gap-2">
                                {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA', 'Defense', 'Contact', 'Magie', 'Distance', 'INIT', 'PV', 'PV_Max'].map(stat => (
                                    <div
                                        key={stat}
                                        draggable
                                        onDragStart={(e) => {
                                            const data = { i: `custom_group:${stat}:${stat}`, w: 3, h: 2 };
                                            e.dataTransfer.setData("text/plain", JSON.stringify(data));
                                        }}
                                        className="flex items-center gap-3 p-3 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl cursor-grab active:cursor-grabbing hover:border-[#d4b48f]/40 hover:bg-[#2a2a2a] transition-all group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-[#0e0e0e] flex items-center justify-center text-[#d4b48f] group-hover:scale-110 transition-transform">
                                            <Box size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-[#d4d4d4] group-hover:text-white">{stat}</span>
                                            <span className="text-[9px] text-[#666] uppercase font-bold tracking-tighter">Glisser sur la fiche</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {(selectedCharacter?.customFields ?? []).length > 0 && (
                            <section className="space-y-3">
                                <span className="text-[10px] font-bold text-[#666] uppercase tracking-widest">Champs Personnalisés</span>
                                <div className="grid grid-cols-1 gap-2">
                                    {selectedCharacter?.customFields?.map(field => (
                                        <div
                                            key={field.id}
                                            draggable
                                            onDragStart={(e) => {
                                                const data = { i: `custom_group:${field.label}:${field.id}`, w: 3, h: 2 };
                                                e.dataTransfer.setData("text/plain", JSON.stringify(data));
                                            }}
                                            className="flex items-center gap-3 p-3 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl cursor-grab active:cursor-grabbing hover:border-[#d4b48f]/40 hover:bg-[#2a2a2a] transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-[#0e0e0e] flex items-center justify-center text-[#d4b48f] group-hover:scale-110 transition-transform">
                                                <Box size={14} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-[#d4d4d4] group-hover:text-white">{field.label}</span>
                                                <span className="text-[9px] text-[#666] uppercase font-bold tracking-tighter">Glisser sur la fiche</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </TabsContent>

                    {/* EXPLORER TAB */}
                    <TabsContent value="explorer" className="m-0 focus-visible:outline-none flex flex-col gap-4">
                        <div className="relative flex items-center shrink-0">
                            <Search size={14} className="absolute left-3 text-[#555]" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg py-2 pl-9 pr-3 text-xs text-[#d4d4d4] placeholder-[#555] focus:outline-none focus:border-[#d4b48f] w-full transition-all"
                            />
                        </div>
                        <div className="flex-1 min-h-0">
                            <ThemeExplorerTab
                                searchQuery={searchQuery}
                                onApplyTheme={onApplyTheme}
                                onPreviewTheme={onPreviewTheme}
                                onStopPreview={onStopPreview}
                            />
                        </div>
                        <div className="pt-2 border-t border-[#2a2a2a]">
                            <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                                <DialogTrigger asChild>
                                    <button className="w-full button-primary !py-2.5 !text-[11px] flex items-center justify-center gap-2 font-bold uppercase tracking-wider">
                                        <UploadCloud size={16} /> Partager mon thème
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
                        </div>
                    </TabsContent>

                    {/* MES THEMES TAB */}
                    <TabsContent value="mes_themes" className="m-0 focus-visible:outline-none">
                        <MyThemesTab
                            onApplyTheme={onApplyTheme}
                            onPreviewTheme={onPreviewTheme}
                            onStopPreview={onStopPreview}
                            currentConfig={{ theme: customizationForm as any, layout }}
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}

// Use GroupCreationSection from FicheWidgets.tsx

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
