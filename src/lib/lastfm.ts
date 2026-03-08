import { ApiHttpError } from "@/lib/api-error";

type LastFmTrack = {
  name?: string;
  artist?: { "#text"?: string };
  album?: { "#text"?: string };
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};

type LastFmRecentTracksResponse = {
  recenttracks?: {
    track?: LastFmTrack[] | LastFmTrack;
  };
};

export type LastFmNormalizedTrack = {
  artistName: string;
  releaseTitle: string;
  listenAtIso: string;
  sourceTrackName: string;
};

function getLastFmApiKey() {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new ApiHttpError(400, "VALIDATION_ERROR", "Missing LASTFM_API_KEY.");
  }
  return apiKey;
}

export async function fetchRecentTracks(params: {
  username: string;
  limit: number;
  fromUnix?: number;
}) {
  const apiKey = getLastFmApiKey();

  const searchParams = new URLSearchParams({
    method: "user.getrecenttracks",
    user: params.username,
    api_key: apiKey,
    format: "json",
    limit: String(params.limit),
  });

  if (params.fromUnix) {
    searchParams.set("from", String(params.fromUnix));
  }

  const response = await fetch(
    `https://ws.audioscrobbler.com/2.0/?${searchParams.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    throw new ApiHttpError(
      502,
      "EXTERNAL_API_ERROR",
      `Last.fm request failed: ${response.status}`
    );
  }

  const payload = (await response.json()) as LastFmRecentTracksResponse;
  const rawTracks = payload.recenttracks?.track;
  const trackList = Array.isArray(rawTracks)
    ? rawTracks
    : rawTracks
      ? [rawTracks]
      : [];

  const normalized: LastFmNormalizedTrack[] = [];
  for (const track of trackList) {
    if (track?.["@attr"]?.nowplaying === "true") {
      continue;
    }

    const uts = track?.date?.uts;
    const artistName = track?.artist?.["#text"]?.trim();
    const albumName = track?.album?.["#text"]?.trim();
    const trackName = track?.name?.trim();

    if (!uts || !artistName) {
      continue;
    }

    const listenAt = new Date(Number.parseInt(uts, 10) * 1000);
    if (Number.isNaN(listenAt.valueOf())) {
      continue;
    }

    const releaseTitle = albumName || trackName;
    if (!releaseTitle) {
      continue;
    }

    normalized.push({
      artistName,
      releaseTitle,
      listenAtIso: listenAt.toISOString(),
      sourceTrackName: trackName ?? releaseTitle,
    });
  }

  return normalized;
}
