// /api/movies — proxy TMDB (Vercel Serverless Function)
// Env wajib: TMDB_API_KEY  (gratis di themoviedb.org/settings/api)
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ api_key: process.env.TMDB_API_KEY, language: "id-ID", ...params });
  const r = await fetch(`${BASE}${path}?${qs}`);
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

function map(it, forcedType) {
  const isTv = forcedType ? forcedType === "tv" : (it.media_type === "tv" || (!it.title && !!it.name));
  return {
    slug: String(it.id),
    type: isTv ? "tv" : "film",
    title: it.title || it.name || "",
    overview: it.overview || "",
    year: (it.release_date || it.first_air_date || "").slice(0, 4),
    rating: it.vote_average || null,
    poster: it.poster_path ? `${IMG}/w500${it.poster_path}` : "",
    backdrop: it.backdrop_path ? `${IMG}/w1280${it.backdrop_path}` : "",
    genres: (it.genres || []).map(g => g.name),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  const { action, type = "all", page = 1, q, slug } = req.query;
  try {
    let data;
    if (action === "popular") {
      if (type === "movie") data = await tmdb("/movie/popular", { page });
      else if (type === "tv") data = await tmdb("/tv/popular", { page });
      else data = await tmdb("/trending/all/week", { page });
      const t = type === "all" ? null : type;
      return res.json({ results: data.results.map(i => map(i, t)) });
    }
    if (action === "upcoming") {
      data = await tmdb("/movie/upcoming", { page });
      return res.json({ results: data.results.map(i => map(i, "movie")) });
    }
    if (action === "latest") {
      const [m, t] = await Promise.all([
        type !== "tv" ? tmdb("/movie/now_playing") : { results: [] },
        type !== "movie" ? tmdb("/tv/on_the_air") : { results: [] },
      ]);
      const list = [...m.results.map(i => map(i, "movie")), ...t.results.map(i => map(i, "tv"))];
      return res.json({ results: list.sort(() => Math.random() - 0.5) });
    }
    if (action === "top-rated") {
      const t = type === "tv" ? "tv" : "movie";
      data = await tmdb(`/${t}/top_rated`, { page });
      return res.json({ results: data.results.map(i => map(i, t)) });
    }
    if (action === "search") {
      if (!q) return res.json({ results: [] });
      data = await tmdb("/search/multi", { query: q, page });
      return res.json({ results: data.results.filter(i => i.media_type !== "person").map(i => map(i)) });
    }
    if (action === "detail") {
      const t = type === "tv" ? "tv" : "movie";
      const d = await tmdb(`/${t}/${encodeURIComponent(slug)}`, { append_to_response: "videos" });
      const vids = d.videos?.results || [];
      const trailer = vids.find(v => v.site === "YouTube" && v.type === "Trailer") || vids.find(v => v.site === "YouTube");
      return res.json({ results: { ...map(d, t), trailer: trailer?.key || "" } });
    }
    res.status(400).json({ error: "action tidak dikenal" });
  } catch (e) {
    res.status(500).json({ error: e.message, results: [] });
  }
}
