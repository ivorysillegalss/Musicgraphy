export type Coordinates = {
  lat: number;
  lng: number;
};

export type ArtistGeo = {
  artistId: string;
  artistName: string;
  countryCode: string | null;
  countryName: string | null;
  cityName: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  geoGranularity?: "city" | "region" | "country";
  coordinates: Coordinates | null;
};

export type UserRecord = {
  id: string;
  albumMbid: string | null;
  albumTitle: string;
  releaseDate: string | null;
  releaseYear: number | null;
  listenAt: string;
  score: number;
  personalTags: string[];
  artistGeo: ArtistGeo;
};

export type ManualEntryRequest = {
  artistName: string;
  releaseTitle: string;
  listenAt: string;
  score: number;
  personalTags?: string[];
};