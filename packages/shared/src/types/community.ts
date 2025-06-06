export interface Squad {
  name: string;
  status: 'active' | 'inactive';
}

export interface ProgRequirement {
  prog: string;
  clear: string;
}

export interface SocialLinks {
  discord: string;
  twitter: string;
  twitch: string;
  youtube: string;
}

export interface CommunityStats {
  totalSignups: number;
  activeEncounters: number;
  currentContent: string;
  squads: Squad[];
  progRequirements: Record<string, ProgRequirement>;
  socialLinks: SocialLinks;
}
