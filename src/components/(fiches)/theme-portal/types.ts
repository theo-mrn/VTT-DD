export interface ThemeValues {
    theme_background?: string;
    theme_secondary_color?: string;
    theme_text_color?: string;
    theme_text_secondary_color?: string;
    theme_border_radius?: number;
    [key: string]: any;
}

export interface ThemeConfig {
    theme: ThemeValues;
    layout: any[];
}

export interface CommunityTheme {
    id: string;
    name: string;
    authorId: string;
    authorName: string;
    createdAt: number;
    likes: number;
    config: ThemeConfig;
}
