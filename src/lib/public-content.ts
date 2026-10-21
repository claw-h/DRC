import type { FacultyProfile } from './system-state';

export interface PublicCollectionRecord {
  id: string;
  data: Record<string, unknown>;
}

export interface PublicBootstrapPayload {
  schemaVersion: 1;
  generatedAt: string;
  profile: FacultyProfile;
  collections: {
    publications: PublicCollectionRecord[];
    books: PublicCollectionRecord[];
    classes: PublicCollectionRecord[];
  };
  links: {
    cv: string;
    publications: string;
  };
}
