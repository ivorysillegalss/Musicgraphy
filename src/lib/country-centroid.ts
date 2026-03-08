import countries from "world-countries";

import type { Coordinates } from "@/lib/types";

type WorldCountry = {
  cca2: string;
  latlng: number[];
  name: {
    common: string;
  };
};

const worldCountries = countries as WorldCountry[];

export function getCountryCoordinates(
  countryCode?: string | null,
  countryName?: string | null
): Coordinates | null {
  const normalizedCode = countryCode?.toUpperCase().trim();
  const normalizedName = countryName?.trim().toLowerCase();

  const byCode = normalizedCode
    ? worldCountries.find((country) => country.cca2 === normalizedCode)
    : undefined;

  const byName = normalizedName
    ? worldCountries.find(
        (country) => country.name.common.toLowerCase() === normalizedName
      )
    : undefined;

  const match = byCode ?? byName;
  if (!match || match.latlng.length < 2) {
    return null;
  }

  return {
    lat: match.latlng[0],
    lng: match.latlng[1],
  };
}