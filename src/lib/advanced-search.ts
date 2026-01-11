import Fuse from 'fuse.js'
import { normalizeString, getSemanticTerms } from './search-config'

/**
 * Score de recherche pour un élément
 */
export interface SearchResult<T> {
    item: T
    score: number // 0 (meilleur) à 1 (pire)
    matches?: string[] // Termes qui ont matché
}

/**
 * Options de configuration pour la recherche avancée
 */
export interface AdvancedSearchOptions {
    keys: string[] // Champs à chercher dans les objets
    threshold?: number // Seuil de similarité Fuse.js (0-1, défaut: 0.4)
    includeScore?: boolean // Inclure le score dans les résultats
    useSemanticSearch?: boolean // Activer la recherche sémantique (défaut: true)
    maxResults?: number // Nombre maximum de résultats (défaut: illimité)
}

/**
 * Recherche exacte pour boost de score
 */
function exactMatchSearch<T>(
    items: T[],
    query: string,
    keys: string[]
): SearchResult<T>[] {
    const normalizedQuery = normalizeString(query)
    const results: SearchResult<T>[] = []

    items.forEach(item => {
        for (const key of keys) {
            const value = (item as any)[key]
            if (typeof value === 'string') {
                const normalizedValue = normalizeString(value)
                if (normalizedValue === normalizedQuery) {
                    results.push({
                        item,
                        score: 0, // Score parfait pour correspondance exacte
                        matches: [key]
                    })
                    return // On a trouvé une correspondance exacte, on passe au suivant
                }
            }
        }
    })

    return results
}

/**
 * Recherche floue avec Fuse.js
 */
function fuzzySearch<T>(
    items: T[],
    query: string,
    keys: string[],
    threshold: number = 0.4
): SearchResult<T>[] {
    const fuse = new Fuse(items, {
        keys,
        threshold, // 0.0 = correspondance exacte, 1.0 = tout correspond
        includeScore: true,
        ignoreLocation: true, // Cherche partout dans la chaîne
        minMatchCharLength: 2, // Au moins 2 caractères doivent correspondre
        useExtendedSearch: false,
    })

    const fuseResults = fuse.search(query)

    return fuseResults.map(result => ({
        item: result.item,
        score: result.score || 0.5,
        matches: result.matches?.map(m => m.key || '') || []
    }))
}

/**
 * Recherche sémantique basée sur le dictionnaire
 */
function semanticSearch<T>(
    items: T[],
    query: string,
    keys: string[],
    threshold: number = 0.4
): SearchResult<T>[] {
    const queryTerms = getSemanticTerms(query)
    const allResults = new Map<T, SearchResult<T>>()

    // Pour chaque terme sémantiquement lié à la query
    queryTerms.forEach((term, index) => {
        const termResults = fuzzySearch(items, term, keys, threshold)

        termResults.forEach(result => {
            const existing = allResults.get(result.item)

            // Pénalise légèrement les résultats sémantiques (terme original = meilleur score)
            const semanticPenalty = index === 0 ? 0 : 0.15
            const adjustedScore = Math.min(1, result.score + semanticPenalty)

            if (!existing || adjustedScore < existing.score) {
                allResults.set(result.item, {
                    ...result,
                    score: adjustedScore
                })
            }
        })
    })

    return Array.from(allResults.values())
}

/**
 * Moteur de recherche avancée combinant plusieurs stratégies
 * 
 * @example
 * ```typescript
 * const results = advancedSearch(objects, 'carrose', {
 *   keys: ['name', 'category'],
 *   threshold: 0.4,
 *   useSemanticSearch: true
 * })
 * ```
 */
export function advancedSearch<T>(
    items: T[],
    query: string,
    options: AdvancedSearchOptions
): SearchResult<T>[] {
    const {
        keys,
        threshold = 0.4,
        useSemanticSearch = true,
        maxResults
    } = options

    if (!query.trim()) {
        return []
    }

    const normalizedQuery = normalizeString(query)
    const resultsMap = new Map<T, SearchResult<T>>()

    // 1. Recherche exacte (score parfait)
    const exactResults = exactMatchSearch(items, normalizedQuery, keys)
    exactResults.forEach(result => {
        resultsMap.set(result.item, result)
    })

    // 2. Recherche floue (fautes de frappe)
    const fuzzyResults = fuzzySearch(items, normalizedQuery, keys, threshold)
    fuzzyResults.forEach(result => {
        const existing = resultsMap.get(result.item)
        if (!existing || result.score < existing.score) {
            resultsMap.set(result.item, result)
        }
    })

    // 3. Recherche sémantique (synonymes)
    if (useSemanticSearch) {
        const semanticResults = semanticSearch(items, normalizedQuery, keys, threshold)
        semanticResults.forEach(result => {
            const existing = resultsMap.get(result.item)
            if (!existing || result.score < existing.score) {
                resultsMap.set(result.item, result)
            }
        })
    }

    // Convertir en array et trier par score (meilleur = plus petit)
    let results = Array.from(resultsMap.values())
        .sort((a, b) => a.score - b.score)

    // Limiter les résultats si demandé
    if (maxResults && maxResults > 0) {
        results = results.slice(0, maxResults)
    }

    return results
}

/**
 * Fonction utilitaire pour filtrer une liste d'items avec recherche avancée
 * Retourne uniquement les items (sans scores) pour compatibilité simple
 */
export function searchAndFilter<T>(
    items: T[],
    query: string,
    keys: string[],
    threshold: number = 0.4
): T[] {
    if (!query.trim()) {
        return items
    }

    const results = advancedSearch(items, query, {
        keys,
        threshold,
        useSemanticSearch: true
    })

    return results.map(r => r.item)
}

/**
 * Utilitaire pour obtenir un score de pertinence en pourcentage (0-100)
 * 100 = correspondance parfaite, 0 = correspondance très faible
 */
export function getRelevancePercentage(score: number): number {
    return Math.max(0, Math.min(100, Math.round((1 - score) * 100)))
}
