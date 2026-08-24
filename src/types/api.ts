/**
 * Shapes the backend actually returns.
 *
 * These are hand-written from the FastAPI responses rather than generated, so treat
 * anything optional here as genuinely optional: several endpoints omit fields entirely
 * (a row generated before a feature existed), which is why so much of this is `?`.
 */

export type Role = 'admin' | 'user';

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  role: Role;
}

export interface MessageState {
  type: '' | 'success' | 'error' | 'info';
  text: string;
}

// --- Drive -----------------------------------------------------------------

export interface DriveStatus {
  connected: boolean;
  /** False when the server itself has no Drive credentials — nothing the user can fix. */
  configured: boolean;
}

/** Per-document Drive outcome attached to a generation result. */
export interface DriveOutcome {
  connected?: boolean;
  synced?: boolean;
  folder_link?: string;
  error?: string;
}

// --- Generation ------------------------------------------------------------

export interface GenerationResult {
  success: boolean;
  error?: string;
  folderName?: string;
  hasPdf?: boolean;
  resumePdfError?: string | null;
  drive?: DriveOutcome | null;
}

export interface JobLinkResult extends GenerationResult {
  jobIndex: number;
  url: string;
}

export interface JobDescriptionResult extends GenerationResult {
  jdIndex: number;
  filename?: string;
}

export interface ScrapeResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface TxtConversionResult {
  upload_id?: string;
  original_filename?: string;
  folder_name?: string;
  success: boolean;
  has_pdf?: boolean;
  error?: string;
  drive?: DriveOutcome | null;
}

export interface JobDescriptionListing {
  job_descriptions: Array<{ filename: string }>;
  count: number;
  has_resumegpt: boolean;
}

// --- Generated-resume history ----------------------------------------------

export interface HistoryFile {
  name: string;
  id?: string;
}

export interface HistoryRow {
  id: string;
  date?: string;
  company?: string;
  role?: string;
  url?: string;
  /** True when the signed-in user is the one who generated it. */
  mine?: boolean;
  owner_email?: string;
  downloadable?: boolean;
  drive_folder_id?: string;
  files: HistoryFile[];
}

export interface HistoryResponse {
  file_path: string;
  history: HistoryRow[];
  /** Rows on this page. */
  count: number;
  /** Rows matching the filter, across every page. */
  total: number;
  /** Of those, how many have files that can actually be fetched. */
  downloadable: number;
  /** Rows in the profile with no filter at all — tells "empty" from "no matches". */
  total_unfiltered: number;
}

// --- Profiles --------------------------------------------------------------

export interface Education {
  degree: string;
  school: string;
  years: string;
}

export interface CandidateProfile {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedin?: string;
  years_of_experience?: string;
  sign_off_name?: string;
  education?: Education[];
  experience?: string[];
}

export interface ProfileSummary {
  name: string;
  isCustom: boolean;
}

// --- Admin: keys and spend --------------------------------------------------

export interface MaskedKey {
  is_set: boolean;
  masked?: string;
  source?: 'env' | 'settings';
}

export interface OpenAIKeys {
  openai_api_key?: MaskedKey;
  openai_admin_key?: MaskedKey;
}

export interface OpenAISpend {
  available: boolean;
  error?: string;
  currency?: string;
  month_to_date?: number;
  month_start?: number;
  today?: number;
}

// --- Admin: usage -----------------------------------------------------------

export interface UsageTally {
  generations: number;
  cost_usd: number;
  total_tokens: number;
  users?: number;
}

export interface UsageUser {
  sub: string;
  name?: string;
  email?: string;
  profiles?: string[];
  today: UsageTally;
  week: UsageTally;
  month: UsageTally;
  last_30: UsageTally;
  range: UsageTally;
  total: UsageTally;
  last_used_at?: string;
}

export interface UsagePeriod {
  period: string;
  label: string;
  generations: number;
  users: number;
  total_tokens: number;
  cost_usd: number;
}

export interface UsageMatrixRow {
  sub: string;
  name?: string;
  email?: string;
  cells: Record<string, UsageTally | undefined>;
  total: UsageTally;
}

export interface UsageMatrixData {
  periods: Array<{ period: string; label: string }>;
  rows: UsageMatrixRow[];
  truncated?: boolean;
  total_periods?: number;
}

export interface UsageBreakdownRow {
  profile?: string;
  action?: string;
  model?: string;
  generations: number;
  users: number;
  cost_usd: number;
}

export interface UsageLogRow {
  timestamp_utc: string;
  sub: string;
  name?: string;
  email?: string;
  profile?: string;
  action?: string;
  company?: string;
  role?: string;
  model?: string;
  url?: string;
  total_tokens?: number;
  cost_usd?: number;
}

export interface UsageResponse {
  connected: boolean;
  group_by: 'day' | 'week' | 'month';
  generated_at?: string;
  sheet?: { sheet_link?: string; pending_writes?: number };
  totals?: {
    today: UsageTally;
    week: UsageTally;
    month: UsageTally;
    all_time: UsageTally;
    range: UsageTally;
  };
  period_starts?: { week?: string; month?: string };
  options?: {
    users?: Array<{ sub: string; name?: string; email?: string }>;
    profiles?: string[];
    actions?: string[];
  };
  users?: UsageUser[];
  series?: UsagePeriod[];
  matrix?: UsageMatrixData;
  profiles?: UsageBreakdownRow[];
  actions?: UsageBreakdownRow[];
  models?: UsageBreakdownRow[];
  rows?: { items: UsageLogRow[]; total: number; offset: number };
}

// --- Admin: users -----------------------------------------------------------

export interface AdminUser {
  sub: string;
  name?: string;
  email: string;
  role: Role;
  /** Admin by way of ADMIN_EMAILS in the environment — the role cannot be changed here. */
  is_env_admin?: boolean;
  assigned_profiles?: string[];
  last_login_at?: number;
}

// --- Admin: logs ------------------------------------------------------------

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  ts?: string;
  level?: string;
  event?: string;
  msg?: string;
  request_id?: string;
  endpoint?: string;
  user_email?: string;
  error?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface LogsResponse {
  entries: LogEntry[];
  total_matched: number;
  truncated?: boolean;
  stats?: { files: number; bytes: number; level: string };
}
