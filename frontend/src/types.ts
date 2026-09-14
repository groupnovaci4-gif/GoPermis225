/** Types partagés avec l'API. Miroir des modèles Pydantic du backend. */

export type Role = "directeur" | "secretaire" | "moniteur";
export type Cote = "ecole" | "eleve";

export type StatutEleve =
  | "actif" | "suspendu" | "diplome" | "abandon" | "recale";

export type Categorie = "A" | "B" | "C" | "D" | "E";

export type MoyenPaiement =
  | "especes" | "orange_money" | "wave" | "mtn_money" | "moov_money" | "virement";

export type TypeSeance = "code" | "conduite";
export type StatutSeance = "planifiee" | "effectuee" | "annulee" | "absent";
export type ResultatExamen = "en_attente" | "admis" | "ajourne";

export interface Utilisateur {
  id: string;
  nom: string;
  telephone: string;
  role: Role;
  actif: boolean;
  tarifHoraire?: number;
  permisEnseigner?: string;
}

export interface Ecole {
  id: string;
  nom: string;
  commune?: string;
  adresse?: string;
  telephone?: string;
  agrement?: string;
  logoUrl?: string;
  tarifParCategorie?: Record<string, number>;
  heuresCodeParDefaut?: number;
  heuresConduiteParDefaut?: number;
}

export interface ChangementStatut {
  statut: StatutEleve;
  motif: string;
  horodatage: string;
  parUtilisateurId: string;
}

export interface Eleve {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  telephone: string;
  telephoneTuteur?: string;
  cni?: string;
  commune?: string;
  photoUrl?: string;
  categorie: Categorie;
  statut: StatutEleve;
  dateInscription: string;
  montantTotal: number;
  heuresCodePrevues: number;
  heuresConduitePrevues: number;
  resultatCode: ResultatExamen;
  resultatConduite: ResultatExamen;
  datePermis?: string | null;
  historiqueStatuts?: ChangementStatut[];
  /** Présent uniquement dans la réponse de création ou de régénération. */
  portailJeton?: string;
}

export interface Solde {
  montantTotal: number;
  totalPaye: number;
  reste: number;
  tropPercu: number;
  tauxRecouvrement: number;
}

export interface Progression {
  heuresCodeFaites: number;
  heuresConduiteFaites: number;
  heuresCodePrevues: number;
  heuresConduitePrevues: number;
  pourcentage: number;
  pretPourExamen: boolean;
}

export interface Paiement {
  id: string;
  eleveId: string;
  /** Joint par le serveur pour l'affichage en liste. */
  eleveNom?: string;
  montant: number;
  moyen: MoyenPaiement;
  date: string;
  reference?: string;
  numeroRecu: string;
  encaissePar?: string;
  note?: string;
}

export interface Seance {
  id: string;
  eleveId: string;
  moniteurId: string;
  vehiculeId?: string;
  type: TypeSeance;
  debut: string;
  fin: string;
  statut: StatutSeance;
  lieu?: string;
  motif?: string;
  kilometrage?: number;
}

export interface AlerteVehicule {
  champ: string;
  libelle: string;
  echeance: string;
  niveau: "expire" | "bientot";
  jours: number;
}

export interface Vehicule {
  id: string;
  immatriculation: string;
  modele: string;
  annee: number;
  categorie: string;
  kilometrage: number;
  actif: boolean;
  assuranceExpire?: string | null;
  visiteTechniqueExpire?: string | null;
  vignetteExpire?: string | null;
  entretiens?: { date: string; nature: string; cout: number; kilometrage: number; note: string }[];
  alertes?: AlerteVehicule[];
}

export interface Impaye extends Solde {
  eleveId: string;
  matricule: string;
  nom: string;
  prenoms: string;
  telephone: string;
  statut: StatutEleve;
}

export interface Kpis {
  elevesActifs: number;
  elevesTotal: number;
  diplomes: number;
  abandons: number;
  tauxReussite: number;
  duTotal: number;
  encaisseTotal: number;
  resteARecouvrer: number;
  encaisseJour: number;
  encaisseMois: number;
  depensesMois: number;
  beneficeMois: number;
  seancesJour: number;
}

export interface TableauBord {
  kpis: Kpis;
  revenusParMois: { annee: number; mois: number; libelle: string; montant: number }[];
  elevesPretsExamen: (Progression & {
    eleveId: string; matricule: string; nom: string; prenoms: string;
  })[];
  performanceMoniteurs: {
    moniteurId: string; nom: string; elevesFormes: number; diplomes: number;
    tauxReussite: number; heures: number; tarifHoraire: number; montant: number;
  }[];
  alertesVehicules: (AlerteVehicule & { vehiculeId: string; immatriculation: string })[];
}

export interface DossierPortail {
  ecole: { nom: string; telephone: string; commune: string; logoUrl: string };
  eleve: Pick<Eleve, "id" | "matricule" | "nom" | "prenoms" | "categorie" | "statut"
    | "photoUrl" | "resultatCode" | "resultatConduite" | "datePermis">;
  solde: Solde;
  progression: Progression;
  paiements: { date: string; montant: number; moyen: MoyenPaiement; numeroRecu: string }[];
  seances: {
    id: string; type: TypeSeance; debut: string; fin: string;
    statut: StatutSeance; lieu: string; moniteur: string; vehicule: string;
  }[];
}

export type Epreuve = "code" | "conduite";

export interface Convocation {
  id: string;
  reference: string;
  eleveId: string;
  eleveNom: string;
  epreuve: Epreuve;
  progression: number;
  creeLe: string;
}

export interface EntreeJournal {
  id: string;
  acteurNom: string;
  action: string;
  cibleType: string;
  cibleId: string;
  details: string;
  creeLe: string;
}
