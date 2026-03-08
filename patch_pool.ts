import { dbAll } from "@/lib/local-db";

import {
  DISCOVERY_ALBUM_CATALOG,
  type DiscoveryAlbum,
} from "@/lib/discovery-catalog";

type DiscoveryPoolFilter = {
  west: number;
  south: number;
  east: number;
  north: number;
  minYear: number;
  maxYear: number;
  limit: number;
  preferredCountries?: string[];
  seed?: string;
};
