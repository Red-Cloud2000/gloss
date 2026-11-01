export type Lang = "ar" | "en";

export type Slim = {
  id: string;
  title: string;
  title_ar: string;
  title_en?: string;
  author: string;
  platform: string;
  content_type: string;
  language: string;
  one_line: string;
  one_line_en?: string;
  value_rating: number;
  tags: string[];
  date_saved: string;
  post_date: string | null;
  thumbnail: string | null;
  original_url: string;
  resolved_url?: string;
  difficulty: string;
  testing_relevance: { score: number; why: string } | null;
  work_relevance: { score: number; why: string } | null;
  has_quick_try: boolean;
  try_this: { idea: string; effort: string }[];
  time_sensitivity: string;
  is_promotional: boolean;
  origin: "corpus" | "added";
  subtopic: string;
  core_idea: string;
  core_idea_ar: string;
  key_points: string[];
};

export type Item = Slim & {
  detailed_summary?: string;
  detailed_summary_en?: string;
  steps?: string[];
  tools_mentioned?: { name: string; url?: string; used_for?: string; version?: string }[];
  prompts_and_code?: { label: string; content: string }[];
  links_mentioned?: { label?: string; url: string }[];
  on_screen_text?: string[];
  comments_insights?: string;
  coverage_notes?: string;
  user_goals?: string[];
  techniques?: string[];
  suggested_category?: string;
  roadmap_stage?: string;
  source_meta?: { local_video?: string | null; warnings?: string[]; has_transcript?: boolean; avatar?: string | null };
  raw_file?: string;
  media_dir?: string | null;
  _origin?: "corpus" | "added";
};

export type Raw = {
  post_text?: string;
  comments_useful?: string[];
  transcripts?: string[];
  frames?: string[];
  warnings?: string[];
  media_kinds?: string[];
  media_notes?: string[];
  title?: string | null;
  author?: string | null;
};

export type Roadmap = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en?: string;
  emoji: string;
  color: string;
  steps: Step[];
};

export type Step = {
  id: string;
  order: number;
  title_ar: string;
  title_en: string;
  merged_takeaway_ar: string;
  merged_takeaway_en?: string;
  item_ids: string[];
  unique_per_item: Record<string, string>;
  difficulty: string;
  est_minutes: number;
  quick_try: boolean;
};

export type PromptRow = {
  id: string;
  item_id: string;
  title: string;
  text: string;
  language: string;
  kind: "prompt" | "command" | "code" | string;
};

export type Failed = {
  id: string;
  url: string;
  platform: string;
  reason: string;
  error: string;
  needs_login: boolean;
  date_saved: string;
  failed_at: string;
  stage: string;
};

export type UserItem = {
  tried?: boolean;
  not_relevant?: boolean;
  notes?: string;
  glosses?: { id: string; quote: string; answer: string }[];
};

export type UserState = {
  items: Record<string, UserItem>;
  days: string[];
  stepsDone: Record<string, boolean>;
  quiz: Record<string, { answers: number[]; score: number }>;
  chats: ChatThread[];
};

export type ChatThread = {
  id: string;
  title: string;
  messages: { role: "user" | "assistant"; content: string; cites?: { id: string; title: string; url: string }[] }[];
};

export type Bootstrap = {
  loadMs: number;
  dataRoot: string;
  counts: { items: number; failed: number; roadmaps: number; prompts: number; byPlatform: Record<string, number> };
  items: Slim[];
  failed: Failed[];
  roadmaps: Roadmap[];
  topicMap: { nodes: { id: string; label_ar: string; label_en: string; size: number; roadmap_id?: string }[]; edges: { source: string; target: string; weight?: number }[] };
  quizzes: Record<string, { q_ar: string; q_en?: string; options_ar: string[]; options_en?: string[]; answer_index: number; explanation_ar: string; explanation_en?: string }[]>;
  prompts: PromptRow[];
  duplicates: { canonical_id: string; duplicate_ids: string[] }[];
  outdated: { item_id: string; tool: string; note_ar: string; note_en?: string }[];
  user: UserState;
  settings: { hasOpenRouter: boolean; hasGroq: boolean; videoCapMb: number; lang: Lang; theme: string; dataRoot: string };
};

export type Route =
  | { page: "dashboard" }
  | { page: "library" }
  | { page: "roadmaps" }
  | { page: "roadmap"; roadmapId: string }
  | { page: "step"; roadmapId: string; stepId: string }
  | { page: "topics" }
  | { page: "assistant" }
  | { page: "prompts" }
  | { page: "ideas" }
  | { page: "duplicates" }
  | { page: "failed" }
  | { page: "settings" }
  | { page: "note"; noteId: string };

export function routeKey(r: Route): string {
  if (r.page === "note") return "note:" + r.noteId;
  if (r.page === "roadmap") return "roadmap:" + r.roadmapId;
  if (r.page === "step") return "step:" + r.stepId;
  return r.page;
}
