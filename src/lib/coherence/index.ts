export { validateCoherence, COHERENCE_SEVERITY, RECETTE_DUPLIQUEE_WINDOW_DAYS } from './validate-coherence';
export type { CoherenceViolation, CoherenceViolationKind } from './validate-coherence';

// CoherenceWarning désigne les violations cohérence de sévérité 'qualite'.
// Aujourd'hui tous les kinds sont 'bloquant' donc ce type est toujours vide à l'exécution.
// Quand un nouveau kind 'qualite' sera ajouté à COHERENCE_SEVERITY, le type devra être
// affiné en Extract<CoherenceViolation, { kind: K }> pour les K→'qualite'.
export type { CoherenceViolation as CoherenceWarning } from './validate-coherence';
