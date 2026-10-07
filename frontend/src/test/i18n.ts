/**
 * Traducteur hors React en français pour tous les tests (docs/i18n.md § 6) : les fonctions qui
 * écrivent un texte (`translate`) répondent comme dans l'app, langue par défaut.
 */
import fr from '@/i18n/messages/fr';
import { installI18nRuntimeForTests } from '@/i18n/runtime';

installI18nRuntimeForTests('fr', fr);
