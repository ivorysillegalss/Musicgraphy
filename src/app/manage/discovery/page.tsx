"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getLocalSessionClient } from "@/lib/local-session-browser";

type Granularity = "city" | "region" | "country";

type ManageItem = {
  id: string;
  album_title: string;
  artist_name: string;
  release_year: number;
  country_code: string;
  country_name: string;
  city_name: string;
  region_code: string | null;
  region_name: string | null;
  geo_granularity: Granularity;
  geo_cluster_key: string | null;
  lng: number;
  lat: number;
  enabled: boolean;
  weight: number;
  created_at: string;
};

type Draft = {
  countryCode: string;
  countryName: string;
  cityName: string;
  regionCode: string;
  regionName: string;
  geoGranularity: Granularity;
  geoClusterKey: string;
  enabled: boolean;
  weight: string;
};

const GRANULARITY_OPTIONS: Granularity[] = ["city", "region", "country"];

function toDraft(item: ManageItem): Draft {
  return {
    countryCode: item.country_code,
    countryName: item.country_name,
    cityName: item.city_name,
    regionCode: item.region_code ?? "",
    regionName: item.region_name ?? "",
    geoGranularity: item.geo_granularity,
    geoClusterKey: item.geo_cluster_key ?? "",
    enabled: item.enabled,
    weight: String(item.weight),
  };
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Request failed";
  }

  const root = payload as { error?: { message?: string } };
  return root.error?.message ?? "Request failed";
}

export default function DiscoveryManagePage() {
  const [items, setItems] = useState<ManageItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function getAuthHeaders() {
    const client = getLocalSessionClient();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token ?? "";
    const email = data.session?.user.email?.trim() ?? "";

    return {
      Authorization: `Bearer ${token}`,
      ...(email ? { "x-user-email": email } : {}),
    };
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/discovery/manage", {
        headers: authHeaders,
      });
      const data = (await res.json()) as { items?: ManageItem[]; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message || "Load failed");
      }

      const fetched = Array.isArray(data.items) ? data.items : [];
      setItems(fetched);
      setDrafts(
        Object.fromEntries(
          fetched.map((item) => [item.id, toDraft(item)])
        )
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }

    return items.filter((item) => {
      const text = [
        item.album_title,
        item.artist_name,
        item.country_code,
        item.country_name,
        item.city_name,
        item.region_code ?? "",
        item.region_name ?? "",
        item.geo_cluster_key ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [items, query]);

  function updateDraft(id: string, next: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...next,
      },
    }));
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setBusyId(id);
    setError(null);
    setNotice(null);

    try {
      const parsedWeight = Number.parseInt(draft.weight, 10);
      if (!Number.isInteger(parsedWeight) || parsedWeight < 1 || parsedWeight > 10) {
        throw new Error("weight must be integer in [1, 10]");
      }

      const authHeaders = await getAuthHeaders();
      const payload = {
        id,
        countryCode: draft.countryCode,
        countryName: draft.countryName,
        cityName: draft.cityName,
        regionCode: draft.regionCode,
        regionName: draft.regionName,
        geoGranularity: draft.geoGranularity,
        geoClusterKey: draft.geoClusterKey,
        enabled: draft.enabled,
        weight: parsedWeight,
      };

      const res = await fetch("/api/discovery/manage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { item?: ManageItem; error?: { message?: string } };

      if (!res.ok || !data.item) {
        throw new Error(getApiErrorMessage(data));
      }

      setItems((prev) => prev.map((item) => (item.id === id ? data.item! : item)));
      setDrafts((prev) => ({ ...prev, [id]: toDraft(data.item!) }));
      setNotice(`Saved ${data.item.artist_name} - ${data.item.album_title}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/discovery/manage?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !data.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice(`Deleted ${id}`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Discovery Geo Manage</h1>
            <Link
              href="/"
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              Exit Manage
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-300">
            Edit region/city/granularity/cluster fields directly. Requires discovery admin email if configured.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search album / artist / country / region / cluster"
              className="w-full max-w-xl rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => void loadItems()}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
              type="button"
            >
              Refresh
            </button>
          </div>
          {loading ? <p className="mt-2 text-sm text-neutral-400">Loading...</p> : null}
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
          {notice ? <p className="mt-2 text-sm text-emerald-300">{notice}</p> : null}
        </header>

        <section className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/60">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                <th className="px-3 py-2">Artist / Album</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Granularity</th>
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const draft = drafts[item.id];
                if (!draft) {
                  return null;
                }
                const rowBusy = busyId === item.id;
                return (
                  <tr key={item.id} className="border-t border-neutral-800 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{item.artist_name}</p>
                      <p className="text-neutral-300">{item.album_title}</p>
                      <p className="text-xs text-neutral-500">{item.id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="mb-1 w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.countryCode}
                        onChange={(event) => updateDraft(item.id, { countryCode: event.target.value })}
                      />
                      <input
                        className="w-40 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.countryName}
                        onChange={(event) => updateDraft(item.id, { countryName: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-40 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.cityName}
                        onChange={(event) => updateDraft(item.id, { cityName: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="mb-1 w-28 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.regionCode}
                        onChange={(event) => updateDraft(item.id, { regionCode: event.target.value })}
                        placeholder="code"
                      />
                      <input
                        className="w-36 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.regionName}
                        onChange={(event) => updateDraft(item.id, { regionName: event.target.value })}
                        placeholder="name"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.geoGranularity}
                        onChange={(event) =>
                          updateDraft(item.id, {
                            geoGranularity: event.target.value as Granularity,
                          })
                        }
                      >
                        {GRANULARITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-48 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.geoClusterKey}
                        onChange={(event) => updateDraft(item.id, { geoClusterKey: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="w-16 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
                        value={draft.weight}
                        onChange={(event) => updateDraft(item.id, { weight: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) => updateDraft(item.id, { enabled: event.target.checked })}
                        />
                        <span>{draft.enabled ? "on" : "off"}</span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          className="rounded border border-cyan-700 px-2 py-1 text-cyan-200 hover:bg-cyan-950 disabled:opacity-50"
                          disabled={rowBusy}
                          onClick={() => void saveRow(item.id)}
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          className="rounded border border-rose-700 px-2 py-1 text-rose-200 hover:bg-rose-950 disabled:opacity-50"
                          disabled={rowBusy}
                          onClick={() => void deleteRow(item.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredItems.length === 0 ? (
            <p className="p-4 text-sm text-neutral-400">No entries matched the current search.</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
