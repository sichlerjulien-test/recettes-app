import type { Participant } from '@/lib/types/domain';

export const participantSansContrainte: Participant = {
  id: 'p-sans-contrainte',
  nom: 'Alex',
  allergies: [],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

export const participantCoeliaque: Participant = {
  id: 'p-coeliaque',
  nom: 'Marie',
  allergies: ['gluten'],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

export const participantVegan: Participant = {
  id: 'p-vegan',
  nom: 'Léo',
  allergies: [],
  regimes: ['vegan'],
  aime: [],
  n_aime_pas: [],
};

export const participantVegetarien: Participant = {
  id: 'p-vegetarien',
  nom: 'Sara',
  allergies: [],
  regimes: ['vegetarien'],
  aime: [],
  n_aime_pas: [],
};

export const participantCoeliaqueVegan: Participant = {
  id: 'p-coeliaque-vegan',
  nom: 'Jules',
  allergies: ['gluten'],
  regimes: ['vegan'],
  aime: [],
  n_aime_pas: [],
};

export const participantAllergiesMultiples: Participant = {
  id: 'p-allergies-multiples',
  nom: 'Camille',
  allergies: ['gluten', 'lait', 'fruits-coque', 'arachides'],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

export const participantVegetarienAllergique: Participant = {
  id: 'p-vegetarien-allergique',
  nom: 'Théo',
  allergies: ['fruits-coque', 'sesame'],
  regimes: ['vegetarien'],
  aime: [],
  n_aime_pas: [],
};

export const participantLaitOeufs: Participant = {
  id: 'p-lait-oeufs',
  nom: 'Inès',
  allergies: ['lait', 'oeufs'],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

export const participantHauteCardinalite: Participant = {
  id: 'p-haute-cardinalite',
  nom: 'Bastien',
  allergies: ['gluten', 'lait', 'oeufs', 'arachides', 'crustaces'],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

export const participantVegetarienLait: Participant = {
  id: 'p-vegetarien-lait',
  nom: 'Chloé',
  allergies: ['lait'],
  regimes: ['vegetarien'],
  aime: [],
  n_aime_pas: [],
};
