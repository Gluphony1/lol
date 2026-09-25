from __future__ import annotations

import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import yt_dlp
from ytmusicapi import YTMusic


HOST = "127.0.0.1"
PORT = 8765
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
}
RESOLVE_TTL_SECONDS = 20 * 60
SEARCH_LIMIT = 18
MAX_CACHE_ITEMS = 256
MAX_REQUESTS_PER_MINUTE = 180

NON_MUSIC_TERMS = {
    "interview",
    "reaction",
    "reacts",
    "review",
    "trailer",
    "teaser",
    "gameplay",
    "walkthrough",
    "tutorial",
    "podcast",
    "episode",
    "documentary",
    "behind the scenes",
    "making of",
    "fan lyric",
    "news",
    "vlog",
    "shorts",
    "challenge",
    "prank",
}
MUSIC_TERMS = {
    "official audio",
    "official music video",
    "music video",
    "lyric video",
    "lyrics",
    "visualizer",
    "audio",
    "live session",
    "acoustic",
    "remix",
}
NOISY_LABELS = re.compile(
    r"\s*[\[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|lyric\s+video|visuali[sz]er|mv|hd|4k|subtitulado(?:\s+al\s+espa[nñ]ol)?|espa[nñ]ol|english)[^\])]*[\])]",
    re.IGNORECASE,
)

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_lyrics_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_catalog_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_rate_hits: dict[str, list[float]] = {}
_cache_lock = threading.Lock()
_rate_lock = threading.Lock()
_resolve_locks: dict[str, threading.Lock] = {}
_ytmusic = YTMusic()

CATALOG_ROWS = (
    ("rock", "Rock essentials", "Guitars, anthems and alternative classics", "Smells Like Teen Spirit", "Nirvana"),
    ("pop", "Pop right now", "Big hooks and current pop favorites", "Levitating", "Dua Lipa"),
    ("latin", "Latin & trap", "Reggaetón, Latin trap and urbano", "MONACO", "Bad Bunny"),
    ("indie", "Indie & alternative", "Fresh finds beyond the obvious", "Do I Wanna Know?", "Arctic Monkeys"),
    ("electronic", "Electronic pulse", "Dance, house and electronic energy", "Levels", "Avicii"),
)


def resolve_lock(video_id: str) -> threading.Lock:
    with _cache_lock:
        return _resolve_locks.setdefault(video_id, threading.Lock())


def ydl_options(**overrides: Any) -> dict[str, Any]:
    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "retries": 2,
    }
    options.update(overrides)
    return options


def clean_display_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" -–—|•")
    return value or "Unknown"


def clean_artist(channel: str, title_artist: str | None = None) -> str:
    if title_artist:
        return clean_display_text(title_artist)
    artist = re.sub(r"\s*-\s*Topic$", "", channel, flags=re.IGNORECASE)
    artist = re.sub(r"^Official\s+", "", artist, flags=re.IGNORECASE)
    artist = re.sub(r"\s+Official$", "", artist, flags=re.IGNORECASE)
    artist = re.sub(r"VEVO$", "", artist, flags=re.IGNORECASE)
    return clean_display_text(artist)


def clean_title(raw_title: str) -> tuple[str, str | None]:
    title = raw_title.split("|")[0].strip()
    previous = None
    while previous != title:
        previous = title
        title = NOISY_LABELS.sub("", title)
    title = re.sub(
        r"\s*[-–—]\s*(?:official\s*)?(?:(?:music|lyric)\s*)?(?:video|audio|lyrics?|visuali[sz]er)\s*$",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"\s+[-–—]\s+(?:part|track)\s+\d+\s+of\s+\d+\s*$",
        "",
        title,
        flags=re.IGNORECASE,
    )
    parts = re.split(r"\s+[-–—]\s+", title, maxsplit=1)
    if len(parts) == 2 and 1 < len(parts[0]) <= 80 and parts[1].strip():
        return clean_display_text(parts[1]), clean_display_text(parts[0])
    return clean_display_text(title), None


def track_identity(raw_title: str, channel: str) -> tuple[str, str]:
    title, title_artist = clean_title(raw_title)
    channel_artist = clean_artist(channel)
    if title_artist:
        normalized_title = re.sub(r"\W+", "", title).casefold()
        normalized_channel = re.sub(r"\W+", "", channel_artist).casefold()
        if normalized_title and normalized_channel and (
            normalized_title in normalized_channel or normalized_channel in normalized_title
        ):
            return clean_display_text(title_artist), channel_artist
    return title, clean_artist(channel, title_artist)


def normalized_text(value: str) -> str:
    return re.sub(r"[^\wáéíóúüñ]+", " ", value.casefold()).strip()


def duration_seconds(value: Any) -> int:
    if isinstance(value, (int, float)):
        return max(0, int(value))
    parts = str(value or "").split(":")
    if not parts or any(not part.isdigit() for part in parts):
        return 0
    total = 0
    for part in parts:
        total = total * 60 + int(part)
    return total


def best_thumbnail(entry: dict[str, Any]) -> str:
    thumbnails = entry.get("thumbnails") or entry.get("thumbnail") or []
    if isinstance(thumbnails, list):
        for image in reversed(thumbnails):
            if isinstance(image, dict) and image.get("url"):
                return str(image["url"])
    video_id = str(entry.get("videoId") or entry.get("id") or "")
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def music_catalog_track(entry: dict[str, Any], reason: str | None = None, album_only: bool = False) -> dict[str, Any] | None:
    video_id = str(entry.get("videoId") or entry.get("id") or "")
    raw_text = f"{entry.get('title') or ''} {entry.get('author') or ''}".casefold()
    if (
        not VIDEO_ID.fullmatch(video_id)
        or entry.get("isAvailable") is False
        or (album_only and entry.get("videoType") != "MUSIC_VIDEO_TYPE_ATV")
        or any(term in raw_text for term in NON_MUSIC_TERMS)
    ):
        return None
    artists = entry.get("artists") or []
    artist = ", ".join(
        clean_display_text(str(item.get("name") or ""))
        for item in artists
        if isinstance(item, dict) and item.get("name")
    ) or clean_artist(str(entry.get("author") or entry.get("channel") or "YouTube Music"))
    album_data = entry.get("album")
    album = str(album_data.get("name") or "Single") if isinstance(album_data, dict) else "Single"
    title, _ = clean_title(str(entry.get("title") or "Untitled"))
    return {
        "videoId": video_id,
        "title": title,
        "artist": artist,
        "album": clean_display_text(album),
        "cover": best_thumbnail(entry),
        "durationSeconds": duration_seconds(entry.get("duration_seconds") or entry.get("length") or entry.get("duration")),
        "reason": reason,
    }


def entity_result(entry: dict[str, Any]) -> dict[str, Any] | None:
    result_type = str(entry.get("resultType") or "")
    if result_type not in {"artist", "album", "single"}:
        return None
    artists = entry.get("artists") or []
    artist = ", ".join(
        clean_display_text(str(item.get("name") or ""))
        for item in artists
        if isinstance(item, dict) and item.get("name")
    )
    entity_title = str(entry.get("title") or entry.get("artist") or artist or "").strip()
    if not entity_title:
        return None
    return {
        "type": "album" if result_type in {"album", "single"} else "artist",
        "id": str(entry.get("browseId") or entry.get("channelId") or entry.get("title") or ""),
        "title": clean_display_text(entity_title),
        "artist": artist,
        "cover": best_thumbnail(entry),
    }


def rank_catalog_track(track: dict[str, Any], query: str, position: int) -> tuple[float, int]:
    query_text = normalized_text(query)
    title = normalized_text(str(track.get("title") or ""))
    artist = normalized_text(str(track.get("artist") or ""))
    query_words = {word for word in query_text.split() if len(word) > 1}
    title_words = set(title.split())
    combined_words = title_words | set(artist.split())
    score = 0.0
    if title == query_text:
        score += 100
    elif title.startswith(query_text):
        score += 45
    if query_words and query_words.issubset(title_words):
        score += 35
    elif query_words and query_words.issubset(combined_words):
        score += 30
    if query_text and query_text in artist:
        score += 28
    # YouTube Music's own ordering is a valuable popularity/relevance signal.
    # Keep it as the tie-breaker instead of boosting same-named cover singles.
    return (-score, position)


def music_score(entry: dict[str, Any], query: str) -> float:
    raw_title = str(entry.get("title") or "")
    channel = str(entry.get("channel") or entry.get("uploader") or "")
    haystack = f"{raw_title} {channel}".lower()
    duration = int(entry.get("duration") or 0)
    if duration and (duration < 45 or duration > 15 * 60):
        return -100
    if any(term in haystack for term in NON_MUSIC_TERMS):
        return -100

    score = 1.0
    if 90 <= duration <= 7 * 60:
        score += 3
    elif duration:
        score += 1
    if any(term in haystack for term in MUSIC_TERMS):
        score += 5
    if " - topic" in channel.lower() or channel.lower().endswith("topic"):
        score += 7
    if "vevo" in channel.lower():
        score += 6
    if "official" in channel.lower():
        score += 4
    if "music" in channel.lower():
        score += 2
    if re.search(r"\s[-–—]\s", raw_title):
        score += 2

    query_words = {
        word
        for word in re.findall(r"[\wáéíóúüñ]+", query.lower())
        if len(word) > 2 and word not in {"song", "music", "official", "audio", "video"}
    }
    if query_words:
        matches = sum(1 for word in query_words if word in haystack)
        score += 5 * matches / len(query_words)
    return score


def search_youtube_fallback(
    query: str,
    limit: int = SEARCH_LIMIT,
    excluded: set[str] | None = None,
    reason: str | None = None,
) -> list[dict[str, Any]]:
    excluded = excluded or set()
    with yt_dlp.YoutubeDL(
        ydl_options(extract_flat="in_playlist", playlistend=40)
    ) as ydl:
        result = ydl.extract_info(
            f"ytsearch40:{query} song official audio",
            download=False,
        )

    candidates: list[tuple[float, int, dict[str, Any]]] = []
    for position, entry in enumerate(result.get("entries") or []):
        video_id = str(entry.get("id") or "")
        if not VIDEO_ID.fullmatch(video_id) or video_id in excluded:
            continue
        score = music_score(entry, query)
        if score < 2:
            continue
        candidates.append((score, position, entry))

    candidates.sort(key=lambda item: (-item[0], item[1]))
    tracks: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for _, _, entry in candidates:
        video_id = str(entry.get("id") or "")
        duration = entry.get("duration")
        title, artist = track_identity(
            str(entry.get("title") or "Untitled"),
            str(entry.get("channel") or entry.get("uploader") or "YouTube Music"),
        )
        identity = (title.casefold(), artist.casefold())
        if identity in seen:
            continue
        seen.add(identity)
        tracks.append(
            {
                "videoId": video_id,
                "title": title,
                "artist": artist,
                "album": "YouTube Music",
                "cover": entry.get("thumbnail")
                or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "durationSeconds": int(duration) if duration else 0,
                "reason": reason,
            }
        )
        if len(tracks) >= limit:
            break
    return tracks


def search_music(
    query: str,
    limit: int = SEARCH_LIMIT,
    excluded: set[str] | None = None,
    reason: str | None = None,
) -> list[dict[str, Any]]:
    excluded = excluded or set()
    try:
        raw_results = _ytmusic.search(query, filter="songs", limit=max(25, limit * 2))
        ranked: list[tuple[tuple[float, int], dict[str, Any]]] = []
        for position, entry in enumerate(raw_results):
            track = music_catalog_track(entry, reason)
            if not track or track["videoId"] in excluded:
                continue
            ranked.append((rank_catalog_track(track, query, position), track))
        ranked.sort(key=lambda item: item[0])
        unique: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for _, track in ranked:
            identity = (normalized_text(track["title"]), normalized_text(track["artist"]))
            if identity in seen:
                continue
            seen.add(identity)
            unique.append(track)
            if len(unique) >= limit:
                break
        if unique:
            return unique
    except Exception as error:
        print(f"[luma-audio] music catalog search fallback: {error}")
    return search_youtube_fallback(query, limit, excluded, reason)


def search_bundle(query: str) -> dict[str, Any]:
    tracks = search_music(query)
    artists: list[dict[str, Any]] = []
    albums: list[dict[str, Any]] = []
    try:
        seen: set[tuple[str, str]] = set()
        for entry in _ytmusic.search(query, limit=30):
            entity = entity_result(entry)
            if not entity:
                continue
            identity = (entity["type"], normalized_text(entity["title"]))
            if identity in seen:
                continue
            seen.add(identity)
            (artists if entity["type"] == "artist" else albums).append(entity)
    except Exception as error:
        print(f"[luma-audio] entity search unavailable: {error}")
    query_key = normalized_text(query)
    artists.sort(key=lambda item: (normalized_text(item["title"]) != query_key, query_key not in normalized_text(item["title"])))
    albums.sort(key=lambda item: (normalized_text(item["title"]) != query_key, query_key not in normalized_text(item["title"])))
    return {"tracks": tracks, "artists": artists[:4], "albums": albums[:6]}


def catalog_mix(seed_title: str, seed_artist: str) -> list[dict[str, Any]]:
    seed_query = f"{seed_title} {seed_artist}"
    seeds: list[dict[str, Any]] = []
    try:
        candidates = [
            track
            for entry in _ytmusic.search(seed_query, filter="songs", limit=15)
            if (track := music_catalog_track(entry))
        ]
        title_key = normalized_text(seed_title)
        artist_key = normalized_text(seed_artist)
        candidates.sort(key=lambda track: (
            normalized_text(track["title"]) != title_key,
            artist_key not in normalized_text(track["artist"]),
        ))
        seeds = candidates[:1]
    except Exception as error:
        print(f"[luma-audio] catalog seed unavailable: {error}")
    if not seeds:
        return []
    seed = seeds[0]
    tracks: list[dict[str, Any]] = []
    seen: set[str] = set()
    artist_counts: dict[str, int] = {}
    try:
        mix = _ytmusic.get_watch_playlist(videoId=seed["videoId"], limit=18)
        for entry in mix.get("tracks") or []:
            track = music_catalog_track(entry, album_only=True)
            if not track or track["videoId"] in seen:
                continue
            artist_key = normalized_text(track["artist"])
            if artist_counts.get(artist_key, 0) >= 2:
                continue
            seen.add(track["videoId"])
            artist_counts[artist_key] = artist_counts.get(artist_key, 0) + 1
            tracks.append(track)
            if len(tracks) >= 8:
                break
    except Exception as error:
        print(f"[luma-audio] catalog mix unavailable: {error}")
    return tracks or search_music(seed_query, limit=8)


def catalog_sections() -> dict[str, Any]:
    cache_key = "default"
    with _cache_lock:
        cached = _catalog_cache.get(cache_key)
        if cached and time.time() - cached[0] < 30 * 60:
            return cached[1]
    sections = []
    for key, title, subtitle, seed_title, seed_artist in CATALOG_ROWS:
        sections.append({
            "id": key,
            "title": title,
            "subtitle": subtitle,
            "tracks": catalog_mix(seed_title, seed_artist),
        })
    payload = {"sections": sections}
    with _cache_lock:
        _catalog_cache[cache_key] = (time.time(), payload)
    return payload


def entry_to_track(entry: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    video_id = str(entry.get("id") or "")
    duration = entry.get("duration")
    title, artist = track_identity(
        str(entry.get("title") or "Untitled"),
        str(entry.get("channel") or entry.get("uploader") or "YouTube Music"),
    )
    return {
        "videoId": video_id,
        "title": title,
        "artist": artist,
        "album": "YouTube Music",
        "cover": entry.get("thumbnail")
        or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "durationSeconds": int(duration) if duration else 0,
        "reason": reason,
    }


def recommend_music(
    seed_tracks: list[tuple[str, str]],
    fallback_seeds: list[str],
    excluded: set[str],
) -> list[dict[str, Any]]:
    buckets: list[list[dict[str, Any]]] = []
    seen_ids = set(excluded)
    for seed_id, seed_name in seed_tracks[:5]:
        reason = f"Because you played {clean_display_text(seed_name)[:80]}"
        bucket: list[dict[str, Any]] = []
        try:
            mix = _ytmusic.get_watch_playlist(videoId=seed_id, limit=18)
            for entry in mix.get("tracks") or []:
                track = music_catalog_track(entry, reason)
                if not track or track["videoId"] in seen_ids:
                    continue
                seen_ids.add(track["videoId"])
                bucket.append(track)
        except Exception as error:
            print(f"[luma-audio] recommendation mix unavailable: {error}")
        if bucket:
            buckets.append(bucket)

    if not buckets:
        for seed in fallback_seeds[:5]:
            clean_seed = clean_display_text(seed)[:80]
            tracks_for_seed = search_music(
                f"{clean_seed} songs",
                limit=8,
                excluded=seen_ids,
                reason=f"Because you listen to {clean_seed}",
            )
            for track in tracks_for_seed:
                seen_ids.add(track["videoId"])
            if tracks_for_seed:
                buckets.append(tracks_for_seed)

    recommendations: list[dict[str, Any]] = []
    artist_counts: dict[str, int] = {}
    while buckets and len(recommendations) < SEARCH_LIMIT:
        next_round: list[list[dict[str, Any]]] = []
        for bucket in buckets:
            while bucket:
                candidate = bucket.pop(0)
                artist_key = normalized_text(candidate["artist"])
                if artist_counts.get(artist_key, 0) >= 3:
                    continue
                recommendations.append(candidate)
                artist_counts[artist_key] = artist_counts.get(artist_key, 0) + 1
                break
            if bucket:
                next_round.append(bucket)
            if len(recommendations) >= SEARCH_LIMIT:
                break
        buckets = next_round
    return recommendations[:SEARCH_LIMIT]


def resolve_audio(video_id: str) -> dict[str, Any]:
    now = time.time()
    with _cache_lock:
        cached = _cache.get(video_id)
        if cached and now - cached[0] < RESOLVE_TTL_SECONDS:
            return cached[1]

    with resolve_lock(video_id):
        with _cache_lock:
            cached = _cache.get(video_id)
            if cached and now - cached[0] < RESOLVE_TTL_SECONDS:
                return cached[1]

        watch_url = f"https://www.youtube.com/watch?v={video_id}"
        with yt_dlp.YoutubeDL(ydl_options(format="bestaudio/best")) as ydl:
            info = ydl.extract_info(watch_url, download=False)

        formats = [
            item
            for item in info.get("formats") or []
            if item.get("url")
            and item.get("acodec") not in (None, "none")
            and item.get("vcodec") in (None, "none")
        ]
        if not formats and info.get("url"):
            formats = [info]
        if not formats:
            raise RuntimeError("No playable audio format was found")

        selected = max(
            formats,
            key=lambda item: (
                float(item.get("abr") or 0),
                float(item.get("tbr") or 0),
            ),
        )
        resolved = {
            "url": selected["url"],
            "headers": selected.get("http_headers") or info.get("http_headers") or {},
            "contentType": selected.get("mime_type")
            or ("audio/mp4" if selected.get("ext") == "m4a" else "audio/webm"),
        }
        resolved_url = urllib.parse.urlparse(str(resolved["url"]))
        if resolved_url.scheme not in {"http", "https"} or not resolved_url.hostname:
            raise RuntimeError("The audio source returned an invalid URL")
        with _cache_lock:
            _cache[video_id] = (time.time(), resolved)
            if len(_cache) > MAX_CACHE_ITEMS:
                oldest = min(_cache, key=lambda key: _cache[key][0])
                _cache.pop(oldest, None)
        return resolved


def audio_source_is_playable(video_id: str) -> bool:
    """Resolve and read a tiny byte range so fallbacks never return a dead URL."""
    try:
        resolved = resolve_audio(video_id)
        headers = {
            str(key): str(value)
            for key, value in resolved["headers"].items()
            if key.lower() not in {"host", "content-length", "connection", "range"}
        }
        headers["Range"] = "bytes=0-1023"
        request = urllib.request.Request(resolved["url"], headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            status = response.getcode()
            chunk = response.read(1024)
            return status in {200, 206} and bool(chunk)
    except (OSError, RuntimeError, urllib.error.URLError, urllib.error.HTTPError):
        with _cache_lock:
            _cache.pop(video_id, None)
        return False


def fetch_lrclib_lyrics(title: str, artist: str, duration: int) -> dict[str, Any] | None:
    if not title or not artist:
        return None
    params = urllib.parse.urlencode({"track_name": title[:120], "artist_name": artist[:120]})
    request = urllib.request.Request(
        f"https://lrclib.net/api/search?{params}",
        headers={"User-Agent": "Luma/0.1 (local music player)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            records = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None
    if not isinstance(records, list) or not records:
        return None

    def record_score(record: dict[str, Any]) -> tuple[int, float]:
        exact = int(str(record.get("trackName") or "").casefold() == title.casefold())
        exact += int(str(record.get("artistName") or "").casefold() == artist.casefold())
        record_duration = float(record.get("duration") or 0)
        distance = abs(record_duration - duration) if duration and record_duration else 9999
        return exact, -distance

    best = max((record for record in records if isinstance(record, dict)), key=record_score, default=None)
    if not best:
        return None

    lines: list[dict[str, Any]] = []
    synced = str(best.get("syncedLyrics") or "")
    for raw_line in synced.splitlines():
        match = re.match(r"\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)", raw_line)
        if not match or not match.group(3).strip():
            continue
        lines.append({
            "start": round(int(match.group(1)) * 60 + float(match.group(2)), 2),
            "duration": 0,
            "text": match.group(3).strip(),
        })
    if not lines:
        plain = str(best.get("plainLyrics") or "")
        lines = [
            {"start": None, "duration": 0, "text": line.strip()}
            for line in plain.splitlines()
            if line.strip()
        ]
    if not lines:
        return None
    return {"lines": lines[:400], "language": "", "source": "lrclib"}


def fetch_lyrics(video_id: str, title: str = "", artist: str = "", duration: int = 0) -> dict[str, Any]:
    now = time.time()
    with _cache_lock:
        cached = _lyrics_cache.get(video_id)
        if cached and now - cached[0] < RESOLVE_TTL_SECONDS:
            return cached[1]

    lrclib_result = fetch_lrclib_lyrics(title, artist, duration)
    if lrclib_result:
        with _cache_lock:
            _lyrics_cache[video_id] = (time.time(), lrclib_result)
        return lrclib_result

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_options()) as ydl:
        info = ydl.extract_info(watch_url, download=False)

    captions = info.get("subtitles") or {}
    source = "official"
    if not captions:
        captions = info.get("automatic_captions") or {}
        source = "automatic"

    language = next(
        (code for code in ("es", "es-419", "en", "en-orig") if code in captions),
        next(iter(captions), ""),
    )
    formats = captions.get(language) or []
    subtitle = next((item for item in formats if item.get("ext") == "json3"), None)
    if not subtitle or not subtitle.get("url"):
        result = {"lines": [], "language": language, "source": source}
    else:
        request = urllib.request.Request(
            str(subtitle["url"]),
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))

        lines: list[dict[str, Any]] = []
        last_text = ""
        for event in payload.get("events") or []:
            text = "".join(str(segment.get("utf8") or "") for segment in event.get("segs") or [])
            text = re.sub(r"\s+", " ", text).strip()
            if not text or text == last_text or text.casefold() in {"[music]", "[música]", "♪"}:
                continue
            last_text = text
            lines.append({
                "start": round(float(event.get("tStartMs") or 0) / 1000, 2),
                "duration": round(float(event.get("dDurationMs") or 0) / 1000, 2),
                "text": text,
            })
        result = {"lines": lines[:400], "language": language, "source": source}

    with _cache_lock:
        _lyrics_cache[video_id] = (time.time(), result)
    return result


def request_allowed(client: str) -> bool:
    now = time.time()
    with _rate_lock:
        recent = [stamp for stamp in _rate_hits.get(client, []) if now - stamp < 60]
        if len(recent) >= MAX_REQUESTS_PER_MINUTE:
            _rate_hits[client] = recent
            return False
        recent.append(now)
        _rate_hits[client] = recent
        return True


class LumaHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[luma-audio] {self.address_string()} {fmt % args}")

    def cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.send_header(
            "Access-Control-Expose-Headers",
            "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_json(403, {"error": "Origin not allowed."})
            return
        if len(self.path) > 2048:
            self.send_json(414, {"error": "Request URL is too long."})
            return
        if not request_allowed(self.client_address[0]):
            self.send_json(429, {"error": "Too many requests. Try again shortly."})
            return
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if parsed.path == "/health":
                self.send_json(200, {"ok": True, "service": "luma-yt-dlp"})
                return
            if parsed.path == "/search":
                term = (query.get("q") or [""])[0].strip()
                if not term or len(term) > 160:
                    self.send_json(400, {"error": "Enter a valid search query."})
                    return
                self.send_json(200, search_bundle(term))
                return
            if parsed.path == "/catalog":
                self.send_json(200, catalog_sections())
                return
            if parsed.path == "/recommend":
                raw_seeds = (query.get("seed") or [""])[0]
                seeds = [seed.strip() for seed in raw_seeds.split("|") if seed.strip()]
                if not seeds:
                    seeds = ["The Weeknd", "Dua Lipa", "Bad Bunny"]
                seed_ids = [
                    video_id
                    for video_id in (query.get("seedId") or [""])[0].split(",")
                    if VIDEO_ID.fullmatch(video_id)
                ]
                seed_tracks = list(zip(seed_ids, seeds))
                excluded = {
                    video_id
                    for video_id in (query.get("exclude") or [""])[0].split(",")
                    if VIDEO_ID.fullmatch(video_id)
                }
                self.send_json(200, {"tracks": recommend_music(seed_tracks, seeds, excluded)})
                return
            if parsed.path == "/prepare":
                video_id = (query.get("id") or [""])[0]
                if not VIDEO_ID.fullmatch(video_id):
                    self.send_json(400, {"error": "Invalid video id."})
                    return
                resolve_audio(video_id)
                self.send_json(200, {"ready": True, "videoId": video_id})
                return
            if parsed.path == "/fallback":
                title = (query.get("title") or [""])[0].strip()[:120]
                artist = (query.get("artist") or [""])[0].strip()[:120]
                excluded_id = (query.get("exclude") or [""])[0]
                if not title:
                    self.send_json(400, {"error": "A song title is required."})
                    return
                excluded = {excluded_id} if VIDEO_ID.fullmatch(excluded_id) else set()
                alternatives = search_music(f"{title} {artist}".strip(), limit=8, excluded=excluded)
                playable = next(
                    (track for track in alternatives if audio_source_is_playable(track["videoId"])),
                    None,
                )
                self.send_json(200, {"track": playable})
                return
            if parsed.path == "/lyrics":
                video_id = (query.get("id") or [""])[0]
                if not VIDEO_ID.fullmatch(video_id):
                    self.send_json(400, {"error": "Invalid video id."})
                    return
                title = (query.get("title") or [""])[0].strip()
                artist = (query.get("artist") or [""])[0].strip()
                if len(title) > 160 or len(artist) > 160:
                    self.send_json(400, {"error": "Lyrics metadata is too long."})
                    return
                try:
                    duration = int((query.get("duration") or ["0"])[0])
                except ValueError:
                    duration = 0
                self.send_json(200, fetch_lyrics(video_id, title, artist, duration))
                return
            if parsed.path == "/stream":
                video_id = (query.get("id") or [""])[0]
                if not VIDEO_ID.fullmatch(video_id):
                    self.send_json(400, {"error": "Invalid video id."})
                    return
                self.proxy_audio(video_id)
                return
            self.send_json(404, {"error": "Not found."})
        except Exception as error:
            print(f"[luma-audio] request failed: {type(error).__name__}: {error}")
            self.send_json(502, {"error": "The music service could not complete this request."})

    def proxy_audio(self, video_id: str) -> None:
        resolved = resolve_audio(video_id)
        headers = {
            str(key): str(value)
            for key, value in resolved["headers"].items()
            if key.lower() not in {"host", "content-length", "connection"}
        }
        range_header = self.headers.get("Range")
        if range_header and len(range_header) <= 100 and re.fullmatch(r"bytes=\d*-\d*", range_header):
            headers["Range"] = range_header
        request = urllib.request.Request(resolved["url"], headers=headers)

        try:
            upstream = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            upstream = error

        status = getattr(upstream, "status", None) or upstream.getcode()
        self.send_response(status)
        self.cors_headers()
        for name in (
            "Content-Type",
            "Content-Length",
            "Content-Range",
            "Accept-Ranges",
        ):
            value = upstream.headers.get(name)
            if value:
                self.send_header(name, value)
        if not upstream.headers.get("Content-Type"):
            self.send_header("Content-Type", resolved["contentType"])
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        while True:
            chunk = upstream.read(128 * 1024)
            if not chunk:
                break
            try:
                self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
        upstream.close()


class LumaServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request: Any, client_address: Any) -> None:
        if isinstance(sys.exception(), (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    server = LumaServer((HOST, PORT), LumaHandler)
    print(f"Luma yt-dlp service ready on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
