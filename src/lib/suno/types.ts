export type SlimTrack = {
  id: string;
  title: string;
  artist: string;
  handle: string;
  image: string;
  videoUrl: string;
  duration: number;
  tags: string;
  lyrics: string;
  createdAt: string;
  sunoPlays: number;
  sunoLikes: number;
  model: string;
  explicit: boolean;
};

export type StationPlaylist = {
  id: string;
  name: string;
  songCount: number;
  image: string;
};

export type StationPage = {
  handle: string;
  displayName: string;
  description: string;
  avatar: string;
  followers: number;
  totalClips: number;
  sunoPlays: number;
  sunoLikes: number;
  page: number;
  tracks: SlimTrack[];
  playlists: StationPlaylist[];
};

export type PlayStat = {
  id: string;
  title: string;
  artist: string;
  plays: number;
  completes: number;
  seconds: number;
  lastAt: number;
  recorded: number;
};

export type HistoryEntry = {
  id: string;
  title: string;
  artist: string;
  at: number;
};

export type KnownTrack = Omit<SlimTrack, "lyrics">;
