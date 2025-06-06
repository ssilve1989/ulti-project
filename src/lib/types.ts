export interface SignupDocument {
  id: string;
  characterName: string;
  world: string;
  encounter: string;
  partyType: 'Early Prog' | 'Prog' | 'Clear';
  role: 'Tank' | 'Healer' | 'DPS';
  job: string;
  progPoint: string;
  availability: string[];
  discordId: string;
  status: 'pending' | 'approved' | 'rejected';
  lastUpdated: Date;
  schedulingStatus?: 'unscheduled' | 'scheduled' | 'confirmed';
  squad?: string | null;
}

export interface Encounter {
  id: string;
  name: string;
  shortName: string;
}

export interface Squad {
  name: string;
  status: 'active' | 'inactive';
}

export interface ProgRequirement {
  prog: string;
  clear: string;
}

export interface CommunityStats {
  totalSignups: number;
  activeEncounters: number;
  currentContent: string;
  squads: Squad[];
  progRequirements: Record<string, ProgRequirement>;
  socialLinks: {
    discord: string;
    twitter: string;
    twitch: string;
    youtube: string;
  };
}

export interface SignupFilters {
  encounter?: string;
  partyType?: string;
  role?: string;
  search?: string;
}

export interface SignupsResponse {
  signups: SignupDocument[];
  total: number;
  encounters: Encounter[];
}
