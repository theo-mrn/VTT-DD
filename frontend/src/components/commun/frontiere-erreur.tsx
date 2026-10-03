'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/lib/telemetry/errors';

/**
 * Isole un composant non essentiel (scène 3D, widget décoratif) : s'il lève
 * une erreur (ressource externe indisponible…), il est remplacé par `repli`
 * au lieu de faire tomber toute la page.
 */
export class FrontiereErreur extends Component<
  { children: ReactNode; repli?: ReactNode },
  { erreur: boolean }
> {
  state = { erreur: false };

  static getDerivedStateFromError() {
    return { erreur: true };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.warn('Composant isolé après une erreur :', erreur.message, info.componentStack);
    reportClientError(erreur, 'frontiere-erreur', { componentStack: info.componentStack });
  }

  render() {
    return this.state.erreur ? (this.props.repli ?? null) : this.props.children;
  }
}
