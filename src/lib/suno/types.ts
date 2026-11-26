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

export type ClipNotes = {
  id: string;
  title: string;
  artist: string;
  handle: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  explicit: boolean;
  model: string;
  modelName: string;
  displayTags: string;
  style: string;
  negativeStyle: string;
  lyrics: string;
  type: string;
  task: string;
  instrumental: boolean;
  hasVocal: boolean;
  remix: boolean;
  canRemix: boolean;
  hasStem: boolean;
  sliders: Record<string, number>;
  coverOf: string;
  persona: string;
  badges: string[];
  plays: number;
  likes: number;
  comments: number;
  image: string;
  videoUrl: string;
  songUrl: string;
};
