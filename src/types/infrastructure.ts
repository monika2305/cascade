export type Sector =
  | 'Power'
  | 'Water'
  | 'Transport'
  | 'Health'
  | 'Communication'
  | 'Emergency Services'
  | 'Other';

export type AssetStatus = 'operational' | 'degraded' | 'failed';

export interface Asset {
  id: string;
  name: string;
  sector: Sector;
  type: string;
  status: AssetStatus;
  latitude?: number;
  longitude?: number;
  capacity?: number;
  currentLoad?: number;
  description?: string;
}

export interface Dependency {
  id?: string;
  source: string; // source asset ID
  target: string; // target asset ID
  type: string;   // e.g., 'powers', 'water_supply', 'communication_link', 'access_road'
  strength?: number; // optional weight / strength (e.g. 1 to 5 or 0.1 to 1.0)
}

export type UserRole = 'general' | 'authority' | 'emergency' | 'operator';

export interface RoleConfig {
  id: UserRole;
  name: string;
  subtitle: string;
  icon: string;
  badge?: string;
  focusDescription: string;
  primarySectors: Sector[];
}

export interface InfrastructureDataset {
  name: string;
  isSample?: boolean;
  assets: Asset[];
  dependencies: Dependency[];
  sectors: Sector[];
  summary: {
    assetCount: number;
    dependencyCount: number;
    sectorCount: number;
    sectorCounts: Record<Sector, number>;
  };
}

export interface ParseResult {
  success: boolean;
  dataset?: InfrastructureDataset;
  errors?: string[];
  warnings?: string[];
}
