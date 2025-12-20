import React from 'react';
import { Layer, LayerType } from '@/app/[roomid]/map/types';
import { Eye, EyeOff, Layers } from 'lucide-react';

interface LayerControlProps {
    layers: Layer[];
    onToggle: (layerId: LayerType) => void;
}

export const LayerControl: React.FC<LayerControlProps> = ({ layers, onToggle }) => {
    return (
        <div className="bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-4 w-64 text-white shadow-2xl">
            <div className="flex items-center gap-2 mb-4 text-white/90">
                <Layers className="w-5 h-5" />
                <h3 className="font-semibold text-sm uppercase tracking-wider">Layers</h3>
            </div>

            <div className="space-y-1">
                {layers.sort((a, b) => b.order - a.order).map((layer) => (
                    <div
                        key={layer.id}
                        className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors group"
                    >
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                            {layer.label}
                        </span>
                        <button
                            onClick={() => onToggle(layer.id)}
                            className={`p-1.5 rounded-md transition-all duration-200 ${layer.isVisible
                                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                    : 'bg-white/5 text-gray-500 hover:bg-white/10'
                                }`}
                            title={layer.isVisible ? 'Hide layer' : 'Show layer'}
                        >
                            {layer.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
