"use client";

import { ReactNode, useState } from "react";

interface Tab {
    id: string;
    label: string;
    icon?: ReactNode;
    badge?: number;
}

interface CustomTabsProps {
    tabs: Tab[];
    defaultTab?: string;
    onTabChange?: (tabId: string) => void;
    children: (activeTab: string) => ReactNode;
}

export default function CustomTabs({
    tabs,
    defaultTab,
    onTabChange,
    children,
}: CustomTabsProps) {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");

    const handleTabClick = (tabId: string) => {
        setActiveTab(tabId);
        onTabChange?.(tabId);
    };

    return (
        <div className="w-full">
            {/* Tabs Header */}
            <div className="flex items-center gap-2 p-1 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)] mb-6 overflow-x-auto">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`
                flex items-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all duration-200 whitespace-nowrap flex-1
                ${isActive
                                    ? "bg-[var(--accent-brown)] text-white shadow-sm"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                                }
              `}
                        >
                            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                            <span className="flex-1">{tab.label}</span>
                            {tab.badge !== undefined && tab.badge > 0 && (
                                <span
                                    className={`
                    flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold
                    ${isActive
                                            ? "bg-white text-[var(--accent-brown)]"
                                            : "bg-red-500 text-white"
                                        }
                  `}
                                >
                                    {tab.badge > 99 ? "99+" : tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="animate-fadeIn">{children(activeTab)}</div>
        </div>
    );
}
