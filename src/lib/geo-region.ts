import { City, State } from "country-state-city";
import { isUnknownGeoLabel } from "@/lib/geo-label";

export type RegionInference = {
  regionCode: string | null;
  regionName: string | null;
  confidence: "high" | "medium" | "low" | "none";
};

type StateRecord = {
  name: string;
  isoCode: string;
};

type CityRecord = {
  name: string;
  stateCode?: string;
};

const statesByCountry = new Map<string, StateRecord[]>();
const citiesByCountry = new Map<string, CityRecord[]>();

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function getStates(countryCode: string) {
  const key = countryCode.toUpperCase();
  if (statesByCountry.has(key)) {
    return statesByCountry.get(key)!;
  }

  const states = (State.getStatesOfCountry(key) as StateRecord[] | undefined) ?? [];
  statesByCountry.set(key, states);
  return states;
}

function getCities(countryCode: string) {
  const key = countryCode.toUpperCase();
  if (citiesByCountry.has(key)) {
    return citiesByCountry.get(key)!;
  }

  const cities = (City.getCitiesOfCountry(key) as CityRecord[] | undefined) ?? [];
  citiesByCountry.set(key, cities);
  return cities;
}

function toRegionResult(state?: StateRecord | null, confidence: RegionInference["confidence"] = "none") {
  if (!state) {
    return {
      regionCode: null,
      regionName: null,
      confidence: "none",
    } satisfies RegionInference;
  }

  return {
    regionCode: state.isoCode,
    regionName: state.name,
    confidence,
  } satisfies RegionInference;
}

export function inferRegionFromCountryAndCity(
  countryCode: string | null | undefined,
  cityName: string | null | undefined
): RegionInference {
  const code = String(countryCode ?? "").trim().toUpperCase();
  const city = normalizeLabel(cityName);

  if (!code || !city || isUnknownGeoLabel(city)) {
    return toRegionResult(null);
  }

  const states = getStates(code);
  if (states.length === 0) {
    return toRegionResult(null);
  }

  const stateMap = new Map(states.map((item) => [item.isoCode, item]));
  const cities = getCities(code);
  if (cities.length === 0) {
    return toRegionResult(null);
  }

  const exactMatches = cities.filter((item) => normalizeLabel(item.name) === city);
  if (exactMatches.length > 0) {
    const stateCode = exactMatches[0].stateCode;
    if (stateCode && stateMap.has(stateCode)) {
      return toRegionResult(stateMap.get(stateCode)!, exactMatches.length === 1 ? "high" : "medium");
    }
  }

  const token = city.length >= 4 ? city : "";
  if (!token) {
    return toRegionResult(null);
  }

  const fuzzyMatches = cities.filter((item) => {
    const normalized = normalizeLabel(item.name);
    return normalized.includes(token) || token.includes(normalized);
  });

  if (fuzzyMatches.length > 0) {
    const stateCode = fuzzyMatches[0].stateCode;
    if (stateCode && stateMap.has(stateCode)) {
      return toRegionResult(stateMap.get(stateCode)!, fuzzyMatches.length === 1 ? "medium" : "low");
    }
  }

  return toRegionResult(null);
}
