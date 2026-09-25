"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  ChevronLeft,
  ChevronRight,
  Compass,
  Disc3,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  color: string;
  duration: string;
  videoId: string;
  reason?: string;
};

type ListeningRecord = {
  track: Track;
  plays: number;
  lastPlayed: number;
};

type Playlist = {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
};

type LyricLine = {
  start: number | null;
  duration: number;
  text: string;
};

type ApiTrack = {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  durationSeconds: number;
  reason?: string | null;
};

type SearchEntity = {
  type: "artist" | "album";
  id: string;
  title: string;
  artist: string;
  cover: string;
};

type CatalogSection = {
  id: string;
  title: string;
  subtitle: string;
  tracks: Track[];
};

type Viewer = {
  displayName: string;
  email: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: Record<string, unknown>) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

const tracks: Track[] = [
  { id: "4NRXx6U8ABQ", title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", cover: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg", color: "#ff2e89", duration: "4:22", videoId: "4NRXx6U8ABQ" },
  { id: "bpOSxM0rNPM", title: "Do I Wanna Know?", artist: "Arctic Monkeys", album: "AM", cover: "https://i.ytimg.com/vi/bpOSxM0rNPM/hqdefault.jpg", color: "#5ae2ff", duration: "4:32", videoId: "bpOSxM0rNPM" },
  { id: "_PJvpq8uOZM", title: "MONACO", artist: "Bad Bunny", album: "Nadie sabe lo que va a pasar mañana", cover: "https://i.ytimg.com/vi/_PJvpq8uOZM/hqdefault.jpg", color: "#a78bfa", duration: "4:28", videoId: "_PJvpq8uOZM" },
  { id: "TUVcZfQe-Kw", title: "Levitating", artist: "Dua Lipa", album: "Future Nostalgia", cover: "https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg", color: "#ff8a3d", duration: "3:51", videoId: "TUVcZfQe-Kw" },
  { id: "DyDfgMOUjCI", title: "bad guy", artist: "Billie Eilish", album: "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?", cover: "https://i.ytimg.com/vi/DyDfgMOUjCI/hqdefault.jpg", color: "#9c7cff", duration: "3:26", videoId: "DyDfgMOUjCI" },
  { id: "eVli-tstM5E", title: "Espresso", artist: "Sabrina Carpenter", album: "Short n' Sweet", cover: "https://i.ytimg.com/vi/eVli-tstM5E/hqdefault.jpg", color: "#22d3ee", duration: "3:21", videoId: "eVli-tstM5E" },
];

const LOCAL_AUDIO_API = "http://127.0.0.1:8765";
const resultColors = ["#ff5ca8", "#60a5fa", "#a78bfa", "#fb7185", "#818cf8", "#22d3ee"];

const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
const mapApiTracks = (items: ApiTrack[]) => items.map((track, index): Track => ({
  id: track.videoId,
  videoId: track.videoId,
  title: track.title,
  artist: track.artist,
  album: track.album,
  cover: track.cover,
  color: resultColors[index % resultColors.length],
  duration: durationLabel(track.durationSeconds || 0),
  reason: track.reason || undefined,
}));
const normalizeSavedTrack = (track: Track): Track => {
  let title = track.title.split("|")[0]
    .replace(/\s*[\[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|lyric video|visualizer|mv|hd|4k)[^\])]*[\])]/gi, "")
    .trim();
  let artist = track.artist
    .replace(/^Official\s+/i, "")
    .replace(/\s+Official$/i, "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
  const parts = title.split(/\s+[-–—]\s+/, 2);
  if (parts.length === 2 && parts[0].length <= 80) {
    artist = parts[0].trim();
    title = parts[1].trim();
  }
  const color = ["#d7ff3f", "#64e4b3", "#38d9a9"].includes(track.color.toLowerCase()) ? "#8b5cf6" : track.color;
  return { ...track, title: title || track.title, artist: artist || track.artist, color };
};

const navItems = [
  { label: "Home", icon: Home },
  { label: "Discover", icon: Compass },
  { label: "Library", icon: Library },
];

export default function HomePage() {
  const [activeNav, setActiveNav] = useState("Home");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<Track>(tracks[0]);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState<string[]>([tracks[1].id]);
  const [savedLikedTracks, setSavedLikedTracks] = useState<Track[]>([tracks[1]]);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(68);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHint, setInstallHint] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsLanguage, setLyricsLanguage] = useState("");
  const [trackSuggestions, setTrackSuggestions] = useState<Track[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [upNext, setUpNext] = useState<Track[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const [searchArtists, setSearchArtists] = useState<SearchEntity[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<SearchEntity[]>([]);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [catalogSections, setCatalogSections] = useState<CatalogSection[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [listeningHistory, setListeningHistory] = useState<ListeningRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [playerRecovery, setPlayerRecovery] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<Track>(current);
  const queueRef = useRef<Track[]>(tracks);
  const availableTracksRef = useRef<Track[]>(tracks);
  const warmedTracksRef = useRef<Set<string>>(new Set());
  const recoveryAttemptedRef = useRef<Set<string>>(new Set());
  const upNextRef = useRef<Track[]>([]);
  const selectTrackRef = useRef<(track: Track) => void>(() => undefined);
  const playingRef = useRef(false);
  const viewerName = profileName || viewer?.displayName || "Luma listener";
  const viewerInitials = viewerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "LU";
  const [fallbackMinutes, fallbackSeconds] = current.duration.split(":").map(Number);
  const timelineDuration = durationSeconds || fallbackMinutes * 60 + fallbackSeconds;
  const catalog = useMemo(() => {
    const unique = new Map<string, Track>();
    for (const track of [...tracks, ...savedLikedTracks, ...playlists.flatMap((playlist) => playlist.tracks), ...listeningHistory.map((item) => item.track), ...recommendations, ...remoteResults, ...trackSuggestions, ...catalogSections.flatMap((section) => section.tracks), current]) {
      unique.set(track.videoId, track);
    }
    return [...unique.values()];
  }, [catalogSections, current, listeningHistory, playlists, recommendations, remoteResults, savedLikedTracks, trackSuggestions]);
  const likedTracks = useMemo(() => catalog.filter((track) => liked.includes(track.id)), [catalog, liked]);
  const selectedPlaylist = useMemo(() => playlists.find((playlist) => playlist.id === selectedPlaylistId) || null, [playlists, selectedPlaylistId]);
  const libraryTracks = useMemo(() => selectedPlaylist ? selectedPlaylist.tracks : likedTracks, [likedTracks, selectedPlaylist]);
  const tasteSeeds = useMemo(() => {
    const artistScores = new Map<string, number>();
    const add = (artist: string, score: number) => artistScores.set(artist, (artistScores.get(artist) || 0) + score);
    for (const [index, item] of listeningHistory.entries()) {
      const recency = Math.max(0, 4 - index * 0.35);
      add(item.track.artist, item.plays * 3 + recency);
    }
    for (const id of liked) {
      const track = catalog.find((item) => item.id === id);
      if (track) add(track.artist, 8);
    }
    for (const playlist of playlists) {
      for (const track of playlist.tracks) add(track.artist, 3);
    }
    add(current.artist, 2);
    return [...artistScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist]) => artist);
  }, [catalog, current.artist, liked, listeningHistory, playlists]);
  const tasteSeedKey = tasteSeeds.join("|");
  const tasteSeedTracks = useMemo(() => tasteSeeds.map((artist) => (
    listeningHistory.find((item) => item.track.artist === artist)?.track
    || catalog.find((track) => track.artist === artist && liked.includes(track.id))
    || catalog.find((track) => track.artist === artist)
  )).filter((track): track is Track => Boolean(track)).slice(0, 5), [catalog, liked, listeningHistory, tasteSeeds]);
  const tasteTrackKey = JSON.stringify(tasteSeedTracks.map((track) => ({ videoId: track.videoId, artist: track.artist })));
  const results = useMemo(() => {
    const term = query.trim();
    if (term) return remoteResults;
    if (activeNav === "Library") return libraryTracks;
    return recommendations.length ? recommendations : tracks;
  }, [activeNav, libraryTracks, query, recommendations, remoteResults]);
  const recentTracks = listeningHistory.length ? listeningHistory.map((item) => item.track) : tracks;
  const topArtist = tasteSeeds[0] || current.artist;
  const autoplayTracks = useMemo(() => {
    const queuedIds = new Set([current.videoId, ...upNext.map((track) => track.videoId)]);
    const unique = new Map<string, Track>();
    for (const track of [...trackSuggestions, ...recommendations, ...results]) {
      if (!queuedIds.has(track.videoId)) unique.set(track.videoId, track);
    }
    return [...unique.values()].slice(0, 8);
  }, [current.videoId, recommendations, results, trackSuggestions, upNext]);
  const activeLyricIndex = useMemo(() => {
    let active = -1;
    for (let index = 0; index < lyrics.length; index += 1) {
      if (typeof lyrics[index].start === "number" && lyrics[index].start <= progress + 0.25) active = index;
      else break;
    }
    return active;
  }, [lyrics, progress]);

  const selectTrack = useCallback((track: Track) => {
    const audio = audioRef.current;
    recoveryAttemptedRef.current.delete(track.videoId);
    setCurrent(track);
    currentRef.current = track;
    setProgress(0);
    setDurationSeconds(0);
    setPlayerError(false);
    setPlayerRecovery(false);
    setDetailOpen(true);
    setActiveNav("Home");
    setQuery("");
    setListeningHistory((items) => {
      const existing = items.find((item) => item.track.videoId === track.videoId);
      const next = existing
        ? items.map((item) => item.track.videoId === track.videoId ? { track, plays: item.plays + 1, lastPlayed: Date.now() } : item)
        : [{ track, plays: 1, lastPlayed: Date.now() }, ...items];
      return next.sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 60);
    });
    if (!audio) return;
    audio.src = `${LOCAL_AUDIO_API}/stream?id=${encodeURIComponent(track.videoId)}`;
    audio.load();
    void audio.play().catch(() => setPlayerError(true));
  }, []);

  const commitUpNext = useCallback((items: Track[]) => {
    const unique = items.filter((track, index, all) => all.findIndex((item) => item.videoId === track.videoId) === index);
    upNextRef.current = unique;
    setUpNext(unique);
  }, []);

  const playNext = useCallback((track: Track) => {
    commitUpNext([track, ...upNextRef.current.filter((item) => item.videoId !== track.videoId)]);
  }, [commitUpNext]);

  const addToQueue = useCallback((track: Track) => {
    if (track.videoId === currentRef.current.videoId || upNextRef.current.some((item) => item.videoId === track.videoId)) return;
    commitUpNext([...upNextRef.current, track]);
  }, [commitUpNext]);

  const playFromQueue = useCallback((track: Track) => {
    commitUpNext(upNextRef.current.filter((item) => item.videoId !== track.videoId));
    selectTrack(track);
  }, [commitUpNext, selectTrack]);

  const removeFromQueue = useCallback((videoId: string) => {
    commitUpNext(upNextRef.current.filter((item) => item.videoId !== videoId));
  }, [commitUpNext]);

  const moveInQueue = useCallback((index: number, direction: number) => {
    const next = [...upNextRef.current];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commitUpNext(next);
  }, [commitUpNext]);

  const stepTrack = useCallback((direction: number) => {
    if (direction > 0 && upNextRef.current.length) {
      const [next, ...rest] = upNextRef.current;
      commitUpNext(rest);
      selectTrack(next);
      return;
    }
    const queue = queueRef.current.length ? queueRef.current : tracks;
    const index = queue.findIndex((track) => track.videoId === currentRef.current.videoId);
    const nextIndex = shuffleEnabled && direction > 0
      ? Math.floor(Math.random() * queue.length)
      : ((index < 0 ? 0 : index) + direction + queue.length) % queue.length;
    selectTrack(queue[nextIndex]);
  }, [commitUpNext, selectTrack, shuffleEnabled]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src) {
      selectTrack(currentRef.current);
      return;
    }
    if (playingRef.current) audio.pause();
    else void audio.play().catch(() => setPlayerError(true));
  }, [selectTrack]);

  const recoverPlayback = useCallback(async () => {
    const failed = currentRef.current;
    const audio = audioRef.current;
    const resumeAt = audio?.currentTime || 0;
    playingRef.current = false;
    setPlaying(false);
    if (recoveryAttemptedRef.current.has(failed.videoId)) {
      setPlayerRecovery(false);
      setPlayerError(true);
      return;
    }
    recoveryAttemptedRef.current.add(failed.videoId);
    setPlayerRecovery(true);
    setPlayerError(false);
    try {
      const response = await fetch(`${LOCAL_AUDIO_API}/refresh?id=${encodeURIComponent(failed.videoId)}`);
      if (!response.ok || !audio) throw new Error("The selected recording is unavailable");
      audio.addEventListener("loadedmetadata", () => {
        if (resumeAt > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1));
        }
      }, { once: true });
      audio.src = `${LOCAL_AUDIO_API}/stream?id=${encodeURIComponent(failed.videoId)}&retry=${Date.now()}`;
      audio.load();
      await audio.play();
      setPlayerRecovery(false);
      setPlayerError(false);
    } catch {
      setPlayerRecovery(false);
      setPlayerError(true);
    }
  }, []);

  const toggleLike = (id: string) => {
    const isLiked = liked.includes(id);
    setLiked((items) => isLiked ? items.filter((item) => item !== id) : [...items, id]);
    setSavedLikedTracks((items) => {
      if (isLiked) return items.filter((track) => track.id !== id);
      const track = catalog.find((item) => item.id === id);
      return track && !items.some((item) => item.id === id) ? [...items, track] : items;
    });
  };

  const warmTrack = useCallback((track: Track) => {
    if (warmedTracksRef.current.has(track.videoId)) return;
    warmedTracksRef.current.add(track.videoId);
    void fetch(`${LOCAL_AUDIO_API}/prepare?id=${encodeURIComponent(track.videoId)}`)
      .then((response) => { if (!response.ok) warmedTracksRef.current.delete(track.videoId); })
      .catch(() => warmedTracksRef.current.delete(track.videoId));
  }, []);

  const createPlaylist = () => {
    const name = playlistName.trim();
    if (!name) return;
    const playlist: Playlist = { id: crypto.randomUUID(), name: name.slice(0, 60), tracks: [], createdAt: Date.now() };
    setPlaylists((items) => [...items, playlist]);
    setSelectedPlaylistId(playlist.id);
    setPlaylistName("");
    setPlaylistOpen(false);
    setActiveNav("Library");
    setQuery("");
  };

  const togglePlaylistTrack = (playlistId: string, track: Track) => {
    setPlaylists((items) => items.map((playlist) => playlist.id !== playlistId ? playlist : {
      ...playlist,
      tracks: playlist.tracks.some((item) => item.videoId === track.videoId)
        ? playlist.tracks.filter((item) => item.videoId !== track.videoId)
        : [...playlist.tracks, track],
    }));
  };

  const openLikedSongs = () => {
    setSelectedPlaylistId(null);
    setActiveNav("Library");
    setQuery("");
  };

  const openPlaylist = (id: string) => {
    setSelectedPlaylistId(id);
    setActiveNav("Library");
    setQuery("");
  };

  const navigate = (destination: string) => {
    setQuery("");
    setActiveNav(destination);
    if (destination === "Library") setSelectedPlaylistId(null);
  };

  const formatTime = durationLabel;

  useEffect(() => {
    selectTrackRef.current = selectTrack;
  }, [selectTrack]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const saved = JSON.parse(localStorage.getItem("luma-profile") || "null") as { liked?: string[]; likedTracks?: Track[]; current?: Track; volume?: number; listeningHistory?: ListeningRecord[]; playlists?: Playlist[]; profileName?: string; notificationsRead?: boolean; upNext?: Track[]; suggestions?: Track[] } | null;
        if (saved?.liked?.every((id) => typeof id === "string")) setLiked(saved.liked);
        if (Array.isArray(saved?.likedTracks)) setSavedLikedTracks(saved.likedTracks.map(normalizeSavedTrack));
        if (saved?.current && typeof saved.current.videoId === "string" && typeof saved.current.title === "string") {
          const restored = normalizeSavedTrack(saved.current);
          setCurrent(restored);
          currentRef.current = restored;
        }
        if (typeof saved?.volume === "number" && saved.volume >= 0 && saved.volume <= 100) setVolume(saved.volume);
        if (typeof saved?.profileName === "string") {
          setProfileName(saved.profileName.slice(0, 60));
          setProfileDraft(saved.profileName.slice(0, 60));
        }
        if (typeof saved?.notificationsRead === "boolean") setNotificationsRead(saved.notificationsRead);
        if (Array.isArray(saved?.playlists)) {
          setPlaylists(saved.playlists.filter((playlist) => playlist?.id && playlist?.name && Array.isArray(playlist.tracks)).map((playlist) => ({
            ...playlist,
            tracks: playlist.tracks.map(normalizeSavedTrack),
          })));
        }
        if (Array.isArray(saved?.upNext)) {
          const restoredQueue = saved.upNext.filter((track) => track?.videoId && track?.title).map(normalizeSavedTrack).slice(0, 100);
          upNextRef.current = restoredQueue;
          setUpNext(restoredQueue);
        }
        if (Array.isArray(saved?.suggestions)) {
          setTrackSuggestions(saved.suggestions
            .filter((track) => track?.videoId && track?.title)
            .map(normalizeSavedTrack)
            .filter((track, index, items) => items.findIndex((item) => item.videoId === track.videoId) === index)
            .slice(0, 120));
        }
        if (Array.isArray(saved?.listeningHistory)) {
          setListeningHistory(saved.listeningHistory
            .filter((item) => item?.track?.videoId && Number.isFinite(item.plays))
            .map((item) => ({ ...item, track: normalizeSavedTrack(item.track) }))
            .slice(0, 60));
        }
      } catch {
        localStorage.removeItem("luma-profile");
      }
      setProfileReady(true);
    });
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ user: Viewer | null }> : null)
      .then((payload) => setViewer(payload?.user ?? null))
      .catch(() => setViewer(null));
    void fetch(`${LOCAL_AUDIO_API}/health`)
      .then((response) => setBackendReady(response.ok))
      .catch(() => setBackendReady(false));
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search-box input")?.focus();
      }
      if (event.code === "Space" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("keydown", focusSearch);
    return () => {
      mounted = false;
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("keydown", focusSearch);
    };
  }, [togglePlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!term) {
        setRemoteResults([]);
        setSearchArtists([]);
        setSearchAlbums([]);
        setSearching(false);
        setSearchError(null);
        return;
      }
      setSearching(true);
      setSearchError(null);
      void fetch(`${LOCAL_AUDIO_API}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { tracks?: ApiTrack[]; artists?: SearchEntity[]; albums?: SearchEntity[]; error?: string };
          if (!response.ok) throw new Error(payload.error || "Search failed.");
          setRemoteResults(mapApiTracks(payload.tracks || []));
          setSearchArtists(Array.isArray(payload.artists) ? payload.artists : []);
          setSearchAlbums(Array.isArray(payload.albums) ? payload.albums : []);
          setBackendReady(true);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setRemoteResults([]);
          setSearchArtists([]);
          setSearchAlbums([]);
          setSearchError(error instanceof Error ? error.message : "Search failed.");
          setBackendReady(false);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, term ? 450 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!profileReady || !backendReady || catalogSections.length) return;
    const controller = new AbortController();
    queueMicrotask(() => setCatalogLoading(true));
    void fetch(`${LOCAL_AUDIO_API}/catalog`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { sections?: Array<{ id: string; title: string; subtitle: string; tracks?: ApiTrack[] }> };
        if (!response.ok) throw new Error("Catalog unavailable");
        setCatalogSections((payload.sections || []).map((section) => ({
          id: section.id,
          title: section.title,
          subtitle: section.subtitle,
          tracks: mapApiTracks(section.tracks || []),
        })).filter((section) => section.tracks.length > 0));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogSections([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [backendReady, catalogSections.length, profileReady]);

  useEffect(() => {
    if (!detailOpen || !backendReady) return;
    const lyricsController = new AbortController();
    const suggestionsController = new AbortController();
    queueMicrotask(() => {
      if (lyricsController.signal.aborted || suggestionsController.signal.aborted) return;
      setLyricsLoading(true);
      setSuggestionsLoading(true);
      setLyrics([]);
    });

    const lyricParams = new URLSearchParams({ id: current.videoId, title: current.title, artist: current.artist, duration: String(Math.round(timelineDuration || 0)) });
    void fetch(`${LOCAL_AUDIO_API}/lyrics?${lyricParams.toString()}`, { signal: lyricsController.signal })
      .then(async (response) => {
        const payload = await response.json() as { lines?: LyricLine[]; language?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "Lyrics unavailable.");
        setLyrics(Array.isArray(payload.lines) ? payload.lines : []);
        setLyricsLanguage(payload.language || "");
      })
      .catch(() => {
        if (!lyricsController.signal.aborted) setLyrics([]);
      })
      .finally(() => {
        if (!lyricsController.signal.aborted) setLyricsLoading(false);
      });

    void fetch(`${LOCAL_AUDIO_API}/recommend?seed=${encodeURIComponent(current.artist)}&seedId=${encodeURIComponent(current.videoId)}&exclude=${encodeURIComponent(current.videoId)}`, { signal: suggestionsController.signal })
      .then(async (response) => {
        const payload = await response.json() as { tracks?: ApiTrack[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Suggestions unavailable.");
        const mapped = mapApiTracks(payload.tracks || []).filter((track) => track.videoId !== current.videoId).slice(0, 8);
        setTrackSuggestions((previous) => [...previous, ...mapped]
          .filter((track, index, items) => items.findIndex((item) => item.videoId === track.videoId) === index)
          .slice(0, 120));
        mapped.slice(0, 3).forEach(warmTrack);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!suggestionsController.signal.aborted) setSuggestionsLoading(false);
      });

    return () => {
      lyricsController.abort();
      suggestionsController.abort();
    };
  }, [backendReady, current.artist, current.title, current.videoId, detailOpen, timelineDuration, warmTrack]);

  useEffect(() => {
    if (!profileReady || !backendReady || query.trim()) return;
    const controller = new AbortController();
    const storedSeeds = JSON.parse(tasteTrackKey) as Array<{ videoId: string; artist: string }>;
    const seedTracks = storedSeeds.length ? storedSeeds : [{ videoId: current.videoId, artist: current.artist }];
    const seed = seedTracks.map((track) => track.artist).join("|") || tasteSeedKey || current.artist;
    const seedIds = seedTracks.map((track) => track.videoId).join(",");
    const excluded = [...tracks, ...listeningHistory.map((item) => item.track), current]
      .map((track) => track.videoId)
      .filter((videoId, index, items) => items.indexOf(videoId) === index)
      .slice(0, 40)
      .join(",");
    void fetch(`${LOCAL_AUDIO_API}/recommend?seed=${encodeURIComponent(seed)}&seedId=${encodeURIComponent(seedIds)}&exclude=${encodeURIComponent(excluded)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { tracks?: ApiTrack[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Recommendations failed.");
        const incoming = mapApiTracks(payload.tracks || []);
        setRecommendations((previous) => [...previous, ...incoming]
          .filter((track, index, items) => items.findIndex((item) => item.videoId === track.videoId) === index)
          .slice(0, 120));
        setBackendReady(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [backendReady, current, listeningHistory, profileReady, query, tasteSeedKey, tasteTrackKey]);

  useEffect(() => {
    queueRef.current = results;
    availableTracksRef.current = catalog;
  }, [catalog, results]);

  useEffect(() => {
    if (!backendReady) return;
    const queue = results.filter((track) => track.videoId !== current.videoId).slice(0, 3);
    queue.forEach(warmTrack);
  }, [backendReady, current.videoId, results, warmTrack]);

  useEffect(() => {
    if (!backendReady) return;
    upNext.slice(0, 3).forEach(warmTrack);
  }, [backendReady, upNext, warmTrack]);

  useEffect(() => {
    if (!profileReady) return;
    currentRef.current = current;
    localStorage.setItem("luma-profile", JSON.stringify({ liked, likedTracks, current, volume, listeningHistory, playlists, profileName, notificationsRead, upNext, suggestions: trackSuggestions }));
  }, [current, liked, likedTracks, listeningHistory, notificationsRead, playlists, profileName, profileReady, trackSuggestions, upNext, volume]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: [{ src: current.cover, sizes: "480x360", type: "image/jpeg" }],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => void audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => stepTrack(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => stepTrack(1));
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [current, playing, stepTrack]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<ModelContext["registerTool"]>[0]) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({ name: "search_music", title: "Search Luma", description: "Search the local music catalog by song or artist.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: ({ query: value }) => { if (typeof value !== "string" || !value.trim()) throw new Error("A search query is required."); setQuery(value); return { query: value, status: "searching" }; } });
    void register({ name: "play_track", title: "Play track", description: "Start a visible Luma search result by its exact title.", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ title }) => { const match = availableTracksRef.current.find((track) => track.title.toLowerCase() === String(title).toLowerCase()); if (!match) throw new Error("Track not found."); selectTrackRef.current(match); return { title: match.title, artist: match.artist, status: "playing" }; } });
    void register({ name: "like_track", title: "Like track", description: "Add a visible Luma track to liked songs.", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ title }) => { const match = availableTracksRef.current.find((track) => track.title.toLowerCase() === String(title).toLowerCase()); if (!match) throw new Error("Track not found."); setLiked((items) => items.includes(match.id) ? items : [...items, match.id]); setSavedLikedTracks((items) => items.some((track) => track.id === match.id) ? items : [...items, match]); return { title: match.title, status: "liked" }; } });
    void register({ name: "queue_track", title: "Queue track", description: "Add a visible Luma track to play next or to the end of the queue.", inputSchema: { type: "object", properties: { title: { type: "string" }, position: { type: "string", enum: ["next", "last"] } }, required: ["title", "position"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ title, position }) => { const match = availableTracksRef.current.find((track) => track.title.toLowerCase() === String(title).toLowerCase()); if (!match) throw new Error("Track not found."); if (position === "next") playNext(match); else addToQueue(match); return { title: match.title, position, status: "queued" }; } });
    return () => lifecycle.abort();
  }, [addToQueue, playNext]);

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstallHint(true);
      window.setTimeout(() => setInstallHint(false), 3200);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <TooltipProvider>
      <div className="app-shell" style={{ "--track-accent": current.color } as React.CSSProperties}>
        <aside className="sidebar">
          <div className="brand" aria-label="Luma home">
            <span className="brand-mark"><i /><i /><i /></span>
            <span>LUMA</span>
          </div>

          <nav className="primary-nav" aria-label="Main navigation">
            {navItems.map(({ label, icon: Icon }) => (
              <button key={label} className={activeNav === label ? "nav-item active" : "nav-item"} onClick={() => navigate(label)}>
                <Icon size={19} strokeWidth={activeNav === label ? 2.4 : 1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="library-block">
            <div className="side-label"><span>Your collection</span><button onClick={() => setPlaylistOpen(true)} aria-label="Create playlist"><Plus size={15} /></button></div>
            <button className="collection-item" onClick={openLikedSongs}><span className="liked-tile"><Heart size={15} fill="currentColor" /></span><span>Liked songs<small>{likedTracks.length} tracks</small></span></button>
            <button className="collection-item" onClick={() => navigate("Discover")}><span className="mix-tile"><Sparkles size={15} /></span><span>Made for you<small>{recommendations.length || "Daily"} picks</small></span></button>
            {playlists.map((playlist) => <button className="collection-item" key={playlist.id} onClick={() => openPlaylist(playlist.id)}><span className="playlist-tile"><ListMusic size={15} /></span><span>{playlist.name}<small>{playlist.tracks.length} tracks</small></span></button>)}
          </div>

          <button className="sidebar-footer" onClick={() => { setProfileDraft(viewerName); setProfileOpen(true); }} aria-label="Open profile">
            <div className="profile-avatar">{viewerInitials}</div>
            <div><strong>{viewerName}</strong><span>{viewer?.email || "Local profile"}</span></div>
            <ChevronRight size={16} />
          </button>
        </aside>

        <main className="content">
          <header className="topbar">
            <div className="history-controls"><button aria-label="Go back" onClick={() => window.history.back()}><ChevronLeft /></button><button aria-label="Go forward" onClick={() => window.history.forward()}><ChevronRight /></button></div>
            <label className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists or albums" aria-label="Search music" />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
              <Button className="upgrade-button" onClick={handleInstall}><Download /> Install app</Button>
              <Popover>
                <PopoverTrigger asChild><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} />{!notificationsRead && <i />}</button></PopoverTrigger>
                <PopoverContent align="end" className="notification-panel">
                  <div className="notification-heading"><strong>Notifications</strong><button onClick={() => setNotificationsRead(true)}>Mark as read</button></div>
                  {!notificationsRead ? <>
                    <div className="notification-item"><span className="notification-icon"><Sparkles size={16} /></span><div><strong>Your mix is ready</strong><p>{recommendations.length} songs based on your recent listening.</p></div></div>
                    <div className="notification-item"><span className="notification-icon"><Heart size={16} /></span><div><strong>Library updated</strong><p>{likedTracks.length} liked {likedTracks.length === 1 ? "song" : "songs"} · {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}.</p></div></div>
                  </> : <p className="notifications-empty">You&apos;re all caught up.</p>}
                </PopoverContent>
              </Popover>
              <button className="mini-avatar" onClick={() => { setProfileDraft(viewerName); setProfileOpen(true); }} aria-label="Open profile">{viewerInitials}</button>
            </div>
          </header>

          <div className="scroll-area">
            <section className="intro-row">
              <div><p className="eyebrow">Your music</p><h1>{query ? "Songs" : activeNav === "Library" ? selectedPlaylist?.name || "Your library" : activeNav === "Discover" ? "Made for you" : detailOpen ? current.title : `Welcome, ${viewerName.split(" ")[0]}.`}</h1></div>
              <p>{query ? searching ? "Finding songs and official music releases…" : `${results.length} music results` : activeNav === "Library" ? selectedPlaylist ? `${selectedPlaylist.tracks.length} songs in this playlist.` : "Likes and playlists, together." : activeNav === "Discover" ? "Recommendations shaped by what you play and like." : detailOpen ? `Now playing · ${current.artist}` : "Play something and Luma will learn your taste."}</p>
            </section>

            {query && (searchArtists.length > 0 || searchAlbums.length > 0) && (
              <section className="search-entities" aria-label="Artists and albums">
                <div className="section-heading"><div><p className="eyebrow">Best matches</p><h2>Artists & albums</h2></div></div>
                <div className="entity-grid">
                  {searchArtists.slice(0, 2).map((entity) => <button className="entity-card artist-entity" key={`artist-${entity.id}`} onClick={() => setQuery(entity.title)}><Image src={entity.cover} alt="" width={72} height={72} unoptimized /><span><small><UserRound size={13} /> Artist</small><strong>{entity.title}</strong><em>Explore songs</em></span><ChevronRight /></button>)}
                  {searchAlbums.slice(0, 4).map((entity) => <button className="entity-card" key={`album-${entity.id}`} onClick={() => setQuery(`${entity.title} ${entity.artist}`.trim())}><Image src={entity.cover} alt="" width={72} height={72} unoptimized /><span><small><Disc3 size={13} /> Album</small><strong>{entity.title}</strong><em>{entity.artist || "YouTube Music"}</em></span><ChevronRight /></button>)}
                </div>
              </section>
            )}

            {!query && activeNav === "Home" && (
              <section className="home-focus" aria-label="Continue listening">
                <Image src={current.cover} alt={`${current.title} cover`} width={280} height={280} priority unoptimized />
                <div className="home-focus-copy">
                  <span className="feature-label"><Sparkles size={14} /> Continue listening</span>
                  <h2>{current.title}</h2>
                  <p>{current.artist}</p>
                  <div className="hero-actions">
                    <Button className="hero-play" onClick={togglePlayback}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />} {playing ? "Pause" : "Play"}</Button>
                    <button className={liked.includes(current.id) ? "round-secondary liked" : "round-secondary"} aria-label="Like current song" onClick={() => toggleLike(current.id)}><Heart size={19} fill={liked.includes(current.id) ? "currentColor" : "none"} /></button>
                  </div>
                </div>
                <div className="taste-summary">
                  <div><strong>{likedTracks.length}</strong><span>Liked songs</span></div>
                  <div><strong>{listeningHistory.length}</strong><span>Recently played</span></div>
                  <div><strong>{topArtist}</strong><span>Top artist</span></div>
                </div>
              </section>
            )}

            {!query && activeNav === "Home" && detailOpen && (
              <section className="song-experience" aria-label={`Lyrics and suggestions for ${current.title}`}>
                <article className="lyrics-card">
                  <div className="lyrics-heading"><div><p className="eyebrow">Lyrics</p><h2>Sing along</h2></div><span><Mic2 size={15} />{lyricsLanguage ? lyricsLanguage.toUpperCase() : "Live"}</span></div>
                  <div className="lyrics-scroll" aria-live="polite">
                    {lyricsLoading && <div className="lyrics-empty">Loading lyrics…</div>}
                    {!lyricsLoading && lyrics.length === 0 && <div className="lyrics-empty"><Mic2 /><strong>Lyrics aren&apos;t available for this release.</strong><span>Try another version of the song.</span></div>}
                    {!lyricsLoading && lyrics.map((line, index) => <button key={`${line.start}-${index}`} className={index === activeLyricIndex ? "lyric-line active" : "lyric-line"} onClick={() => { if (typeof line.start !== "number") return; if (audioRef.current) audioRef.current.currentTime = line.start; setProgress(line.start); }}>{line.text}</button>)}
                  </div>
                </article>
                <aside className="suggestions-card">
                  <div className="lyrics-heading"><div><p className="eyebrow">Up next</p><h2>You might also like</h2></div><Sparkles size={18} /></div>
                  <div className="suggestion-list">
                    {trackSuggestions.map((track, index) => <button key={track.videoId} className="suggestion-row" onMouseEnter={() => warmTrack(track)} onFocus={() => warmTrack(track)} onClick={() => selectTrack(track)}><span>{String(index + 1).padStart(2, "0")}</span><Image src={track.cover} alt="" width={48} height={48} unoptimized /><span><strong>{track.title}</strong><small>{track.artist}</small></span><Play size={15} fill="currentColor" /></button>)}
                    {suggestionsLoading && <div className="suggestion-loading">Adding more suggestions…</div>}
                    {!suggestionsLoading && trackSuggestions.length === 0 && <div className="suggestion-loading">Play another song to refresh suggestions.</div>}
                  </div>
                </aside>
              </section>
            )}

            {!query && activeNav === "Discover" && (
              <div className="taste-strip"><Sparkles size={17} /><span>Recommendations tuned from</span>{tasteSeeds.map((artist) => <button key={artist} onClick={() => setQuery(artist)}>{artist}</button>)}</div>
            )}

            {!query && activeNav === "Library" && (
              <div className="library-shelf">
                <button className={!selectedPlaylist ? "library-summary active" : "library-summary"} onClick={openLikedSongs}><span className="liked-tile"><Heart size={20} fill="currentColor" /></span><div><strong>Liked songs</strong><p>{likedTracks.length} saved {likedTracks.length === 1 ? "song" : "songs"}</p></div></button>
                {playlists.map((playlist) => <button className={selectedPlaylistId === playlist.id ? "library-summary active" : "library-summary"} key={playlist.id} onClick={() => openPlaylist(playlist.id)}><span className="playlist-tile"><ListMusic size={20} /></span><div><strong>{playlist.name}</strong><p>{playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}</p></div></button>)}
                <button className="library-summary create-playlist" onClick={() => setPlaylistOpen(true)}><span className="playlist-tile"><Plus size={20} /></span><div><strong>New playlist</strong><p>Build your own mix</p></div></button>
              </div>
            )}

            <section className="section-block">
              <div className="section-heading"><div><p className="eyebrow">{query ? "Music only" : activeNav === "Library" ? "Inside this collection" : recommendations.length ? "Based on your listening" : "Start your profile"}</p><h2>{query ? "Songs" : activeNav === "Library" ? selectedPlaylist?.name || "Liked songs" : activeNav === "Discover" ? "Your daily mix" : "Picked for you"}</h2></div>{!query && activeNav === "Home" && <button onClick={() => navigate("Discover")}>View all <ChevronRight size={16} /></button>}</div>
              <div className="album-grid">
                {results.slice(0, query || activeNav !== "Home" ? 18 : 6).map((track) => (
                  <article className={current.videoId === track.videoId ? "album-card selected" : "album-card"} key={track.id}>
                    <button className="cover-button" onMouseEnter={() => warmTrack(track)} onFocus={() => warmTrack(track)} onClick={() => selectTrack(track)} aria-label={`Play ${track.title} by ${track.artist}`}>
                      <Image src={track.cover} alt="" width={360} height={360} unoptimized />
                      <span className="card-play">{current.videoId === track.videoId && playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</span>
                      <span className="card-index">♪</span>
                    </button>
                    <div className="card-meta">
                      <div><h3>{track.title}</h3><p>{track.artist}</p>{track.reason && <small className="recommendation-reason">{track.reason}</small>}</div>
                      <div className="card-actions">
                        <button className={liked.includes(track.id) ? "liked" : ""} onClick={() => toggleLike(track.id)} aria-label={liked.includes(track.id) ? "Remove from liked songs" : "Add to liked songs"}><Heart size={17} fill={liked.includes(track.id) ? "currentColor" : "none"} /></button>
                        <Popover>
                          <PopoverTrigger asChild><button aria-label={`More options for ${track.title}`}><MoreHorizontal size={17} /></button></PopoverTrigger>
                          <PopoverContent align="end" className="playlist-menu track-menu">
                            <strong>Play and save</strong>
                            <button onClick={() => playNext(track)}><span>Play next</span><small>Next</small></button>
                            <button onClick={() => addToQueue(track)}><span>Add to queue</span><small>{upNext.some((item) => item.videoId === track.videoId) ? "Queued" : "Last"}</small></button>
                            <div className="menu-divider" />
                            <strong>Save to playlist</strong>
                            {playlists.map((playlist) => { const included = playlist.tracks.some((item) => item.videoId === track.videoId); return <button key={playlist.id} onClick={() => togglePlaylistTrack(playlist.id, track)}><span>{playlist.name}</span><small>{included ? "Added" : `${playlist.tracks.length} songs`}</small></button>; })}
                            {playlists.length === 0 && <p>Create your first playlist to save this song.</p>}
                            <Button size="sm" onClick={() => setPlaylistOpen(true)}><Plus /> New playlist</Button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {searching && <div className="empty-state"><Search /><h3>Finding songs…</h3><p>Filtering out interviews, reactions and unrelated videos.</p></div>}
              {!searching && results.length === 0 && <div className="empty-state">{activeNav === "Library" && !query ? <Heart /> : <Search />}<h3>{searchError ? "Local audio service unavailable" : activeNav === "Library" && !query ? selectedPlaylist ? "This playlist is empty" : "Your liked songs are empty" : "No songs found"}</h3><p>{searchError || (activeNav === "Library" && !query ? selectedPlaylist ? "Use the playlist button on any song to add it here." : "Like a song and it will appear here." : "Try another song or artist.")}</p><Button onClick={() => activeNav === "Library" && !query ? navigate("Discover") : setQuery("")}>{activeNav === "Library" && !query ? "Discover music" : "Clear search"}</Button></div>}
            </section>

            {!query && activeNav !== "Library" && (
              <div className="catalog-sections" aria-label="Browse music by style">
                {catalogLoading && <section className="catalog-loading"><span /><span /><span /><span /></section>}
                {catalogSections.map((section) => <section className="catalog-row" key={section.id}>
                  <div className="section-heading"><div><p className="eyebrow">Explore by sound</p><h2>{section.title}</h2><span className="section-subtitle">{section.subtitle}</span></div><button onClick={() => setQuery(section.title)}>See all <ChevronRight size={16} /></button></div>
                  <div className="catalog-carousel">
                    {section.tracks.map((track) => <button className="catalog-card" key={`${section.id}-${track.videoId}`} onMouseEnter={() => warmTrack(track)} onFocus={() => warmTrack(track)} onClick={() => selectTrack(track)}>
                      <span className="catalog-cover"><Image src={track.cover} alt="" width={220} height={220} unoptimized /><i><Play size={18} fill="currentColor" /></i></span>
                      <strong>{track.title}</strong><small>{track.artist}</small><em>{track.album}</em>
                    </button>)}
                  </div>
                </section>)}
              </div>
            )}

            {!query && activeNav === "Home" && (
              <section className="section-block track-section">
                <div className="section-heading"><div><p className="eyebrow">Recently played</p><h2>Back in rotation</h2></div></div>
                <div className="track-list">
                  {recentTracks.slice(0, 4).map((track, index) => (
                    <button className="track-row" key={track.id} onMouseEnter={() => warmTrack(track)} onFocus={() => warmTrack(track)} onClick={() => selectTrack(track)}>
                      <span className="track-number">{current.videoId === track.videoId && playing ? <span className="playing-bars"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>
                      <Image src={track.cover} alt="" width={52} height={52} unoptimized />
                      <span className="track-title"><strong>{track.title}</strong><small>{track.artist}</small></span>
                      <span className="track-album">{track.album}</span>
                      <span className="track-duration">{track.duration}</span>
                      <MoreHorizontal size={18} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>

        <audio
          ref={audioRef}
          preload="auto"
          onLoadedMetadata={(event) => setDurationSeconds(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onPlay={() => { playingRef.current = true; setPlaying(true); setPlayerRecovery(false); setPlayerError(false); }}
          onPause={() => { playingRef.current = false; setPlaying(false); }}
          onEnded={() => repeatEnabled ? selectTrack(currentRef.current) : stepTrack(1)}
          onError={() => void recoverPlayback()}
        />

        <footer className="player">
          <div className="now-playing">
            <button className="player-track-open" onClick={() => { setDetailOpen(true); navigate("Home"); }} aria-label={`Open ${current.title}`}><Image src={current.cover} alt={`${current.title} thumbnail`} width={58} height={58} unoptimized /></button>
            <button className="player-track-copy" onClick={() => { setDetailOpen(true); navigate("Home"); }}><strong>{current.title}</strong><span>{current.artist}</span>{playerRecovery && <small>Retrying the same recording…</small>}{playerError && <small>This recording is temporarily unavailable</small>}</button>
            <button className={liked.includes(current.id) ? "liked" : ""} onClick={() => toggleLike(current.id)} aria-label="Like current track"><Heart size={18} fill={liked.includes(current.id) ? "currentColor" : "none"} /></button>
            <button className="queue-open-short" onClick={() => setQueueOpen(true)} aria-label={`Open queue with ${upNext.length} songs`}><ListMusic size={18} />{upNext.length > 0 && <i>{upNext.length}</i>}</button>
          </div>

          <div className="transport">
            <div className="transport-buttons">
              <Tooltip><TooltipTrigger asChild><button className={shuffleEnabled ? "active" : ""} aria-label="Shuffle" aria-pressed={shuffleEnabled} onClick={() => setShuffleEnabled((value) => !value)}><Shuffle size={16} /></button></TooltipTrigger><TooltipContent>Shuffle</TooltipContent></Tooltip>
              <button aria-label="Previous track" onClick={() => stepTrack(-1)}><SkipBack size={19} fill="currentColor" /></button>
              <button className="main-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
              <button aria-label="Next track" onClick={() => stepTrack(1)}><SkipForward size={19} fill="currentColor" /></button>
              <Tooltip><TooltipTrigger asChild><button className={repeatEnabled ? "active" : ""} aria-label="Repeat" aria-pressed={repeatEnabled} onClick={() => setRepeatEnabled((value) => !value)}><Repeat2 size={17} /></button></TooltipTrigger><TooltipContent>Repeat</TooltipContent></Tooltip>
            </div>
            <div className="timeline"><span>{formatTime(progress)}</span><Slider value={[Math.min(progress, timelineDuration)]} max={timelineDuration} onValueChange={(value) => setProgress(value[0])} onValueCommit={(value) => { if (audioRef.current) audioRef.current.currentTime = value[0]; }} aria-label="Track progress" /><span>{formatTime(timelineDuration)}</span></div>
          </div>

          <div className="player-extras"><span className={backendReady ? "service-dot online" : "service-dot"} title={backendReady ? "Audio ready" : "Audio offline"} /><Volume2 size={18} /><Slider value={[volume]} onValueChange={(value) => setVolume(value[0])} aria-label="Volume" /><button className="queue-pill" onClick={() => setQueueOpen(true)}><ListMusic size={15} /> Queue{upNext.length > 0 && <b>{upNext.length}</b>}</button></div>
        </footer>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigate(label)} className={activeNav === label ? "active" : ""}><Icon size={20} /><span>{label}</span></button>)}
        </nav>
        <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
          <SheetContent className="queue-sheet" side="right">
            <SheetHeader className="queue-header">
              <SheetTitle>Play queue</SheetTitle>
              <SheetDescription>{upNext.length ? `${upNext.length} ${upNext.length === 1 ? "song" : "songs"} waiting` : "Add songs or keep autoplay on."}</SheetDescription>
            </SheetHeader>
            <div className="queue-current">
              <Image src={current.cover} alt="" width={72} height={72} unoptimized />
              <div><span>Now playing</span><strong>{current.title}</strong><small>{current.artist}</small></div>
              {playing ? <span className="playing-bars"><i /><i /><i /></span> : <Play size={18} fill="currentColor" />}
            </div>
            <div className="queue-content">
              <div className="queue-section-heading"><div><span>Next in queue</span><small>Use arrows to reorder</small></div>{upNext.length > 0 && <button onClick={() => commitUpNext([])}><Trash2 size={15} /> Clear</button>}</div>
              {upNext.length === 0 && <div className="queue-empty"><ListMusic /><strong>Your queue is empty</strong><span>Use a song menu and choose Play next or Add to queue.</span></div>}
              <div className="queue-list">
                {upNext.map((track, index) => <article className="queue-row" key={track.videoId}>
                  <button className="queue-track" onClick={() => playFromQueue(track)}><span>{String(index + 1).padStart(2, "0")}</span><Image src={track.cover} alt="" width={48} height={48} unoptimized /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button>
                  <div className="queue-actions"><button disabled={index === 0} onClick={() => moveInQueue(index, -1)} aria-label={`Move ${track.title} up`}><ArrowUp /></button><button disabled={index === upNext.length - 1} onClick={() => moveInQueue(index, 1)} aria-label={`Move ${track.title} down`}><ArrowDown /></button><button onClick={() => removeFromQueue(track.videoId)} aria-label={`Remove ${track.title} from queue`}><X /></button></div>
                </article>)}
              </div>
              <div className="queue-section-heading autoplay-heading"><div><span>Autoplay</span><small>Based on what you are listening to</small></div><Sparkles size={17} /></div>
              <div className="autoplay-list">
                {autoplayTracks.map((track) => <article className="autoplay-row" key={track.videoId}><button onClick={() => selectTrack(track)}><Image src={track.cover} alt="" width={44} height={44} unoptimized /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><button onClick={() => addToQueue(track)} aria-label={`Add ${track.title} to queue`}><Plus /></button></article>)}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="profile-dialog">
            <DialogHeader>
              <div className="profile-dialog-avatar">{viewerInitials}</div>
              <DialogTitle>{viewerName}</DialogTitle>
              <DialogDescription>{viewer?.email || "Local profile saved on this device"}</DialogDescription>
            </DialogHeader>
            <label className="profile-name-field"><span>Display name</span><input value={profileDraft} maxLength={60} onChange={(event) => setProfileDraft(event.target.value)} placeholder="Your name" /></label>
            <div className="profile-stats"><div><strong>{likedTracks.length}</strong><span>Liked</span></div><div><strong>{listeningHistory.length}</strong><span>Played</span></div><div><strong>{topArtist}</strong><span>Top artist</span></div></div>
            <div className="profile-status"><span className={backendReady ? "service-dot online" : "service-dot"} />{backendReady ? "Local audio service connected" : "Local audio service offline"}</div>
            <div className="profile-actions"><Button onClick={() => { setProfileName(profileDraft.trim().slice(0, 60)); setProfileOpen(false); }}>Save profile</Button><Button variant="secondary" onClick={() => { navigate("Library"); setProfileOpen(false); }}>Open library</Button>{viewer && <a href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a>}</div>
          </DialogContent>
        </Dialog>
        <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}>
          <DialogContent className="playlist-dialog">
            <DialogHeader><div className="playlist-dialog-icon"><ListMusic /></div><DialogTitle>Create a playlist</DialogTitle><DialogDescription>Give your mix a name. You can add any song from its menu.</DialogDescription></DialogHeader>
            <label className="profile-name-field"><span>Playlist name</span><input value={playlistName} maxLength={60} onChange={(event) => setPlaylistName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createPlaylist(); }} placeholder="Late night drive" autoFocus /></label>
            <div className="profile-actions"><Button variant="secondary" onClick={() => setPlaylistOpen(false)}>Cancel</Button><Button onClick={createPlaylist} disabled={!playlistName.trim()}><Plus /> Create playlist</Button></div>
          </DialogContent>
        </Dialog>
        {installHint && <div className="install-hint" role="status">On Android, open your browser menu and choose <strong>Add to Home screen</strong>.</div>}
      </div>
    </TooltipProvider>
  );
}
