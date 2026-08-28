/** Tipos espejo de los schemas Pydantic del backend. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserOut {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "admin" | "gerente" | "vendedor";
  phone: string | null;
  avatar_color: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface UserBrief {
  id: string;
  full_name: string;
  avatar_color: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  locale: string;
  timezone: string;
  lead_distribution: string;
  allow_ai_processing: boolean;
  ai_provider: string | null;
  ai_model: string | null;
  ai_base_url: string | null;
  ai_monthly_limit_usd: number | null;
  ai_api_key_set: boolean;
  ai_api_key_hint: string | null;
}

export interface Stage {
  id: string;
  key: string;
  name: string;
  position: number;
  color: string;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface VehicleBrief {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  year: number;
  price: number;
  status: string;
  title: string;
  thumbnail_url: string | null;
}

export interface CustomerBrief {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  lead_score: number;
  score_label: string;
}

export interface ScoreFactor {
  label: string;
  points: number;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  source: string;
  status: string;
  assigned_user: UserBrief | null;
  interested_vehicle: VehicleBrief | null;
  budget: number | null;
  financing_interest: boolean;
  has_trade_in: boolean;
  interest_brand: string | null;
  interest_model: string | null;
  interest_body_type: string | null;
  interest_year_min: number | null;
  interest_year_max: number | null;
  interest_transmission: string | null;
  interest_fuel: string | null;
  notes: string | null;
  lead_score: number;
  score_label: string;
  score_reason: string | null;
  score_factors: ScoreFactor[];
  score_updated_at: string | null;
  ai_summary: string | null;
  ai_summary_at: string | null;
  last_contact_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_followup_at: string | null;
  awaiting_reply: boolean;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface CustomerNote {
  id: string;
  body: string;
  pinned: boolean;
  user: UserBrief | null;
  created_at: string;
}

export interface DuplicateMatch {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  matched_by: string;
}

export interface VehicleImage {
  id: string;
  url: string;
  position: number;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  title: string;
  year: number;
  km: number;
  price: number;
  cost: number | null;
  plate: string | null;
  fuel: string;
  transmission: string;
  color: string | null;
  location: string | null;
  body_type: string;
  doors: number | null;
  status: string;
  description: string | null;
  observations: string | null;
  assigned_user: UserBrief | null;
  entry_date: string;
  published_at: string | null;
  sold_at: string | null;
  sold_price: number | null;
  days_in_stock: number;
  thumbnail_url: string | null;
  images: VehicleImage[];
  created_at: string;
  updated_at: string;
}

export interface VehicleStats {
  inquiries: number;
  interested_customers: CustomerBrief[];
  opportunities_count: number;
  quotes_count: number;
  appointments_count: number;
  conversion_rate: number | null;
  margin: number | null;
  margin_percent: number | null;
  demand_index: number | null;
  demand_text: string | null;
  avg_days_fleet: number | null;
}

export interface Conversation {
  id: string;
  customer: CustomerBrief;
  channel: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: string | null;
  awaiting_reply: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "entrante" | "saliente";
  channel: string;
  body: string;
  sent_by: UserBrief | null;
  ai_generated: boolean;
  created_at: string;
}

export interface SuggestedReply {
  tone: string;
  text: string;
}

export interface Opportunity {
  id: string;
  customer: CustomerBrief;
  vehicle: VehicleBrief | null;
  owner: UserBrief | null;
  stage: Stage;
  status: string;
  expected_value: number | null;
  probability: number | null;
  source: string | null;
  health: "green" | "yellow" | "red";
  lost_reason: string | null;
  notes: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageHistory {
  id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  created_at: string;
}

export interface Followup {
  id: string;
  customer: CustomerBrief;
  opportunity_id: string | null;
  user: UserBrief | null;
  due_at: string;
  type: string;
  priority: string;
  note: string | null;
  status: string;
  origin: string;
  suggested_reason: string | null;
  completed_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  customer: CustomerBrief | null;
  user: UserBrief | null;
  due_at: string | null;
  priority: string;
  status: string;
  origin: string;
  completed_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  type: string;
  customer: CustomerBrief | null;
  vehicle: VehicleBrief | null;
  user: UserBrief | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  status: string;
}

export interface TradeIn {
  id: string;
  customer_id: string;
  opportunity_id: string | null;
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  km: number | null;
  plate: string | null;
  condition: string | null;
  estimated_value: number | null;
  offered_value: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface Financing {
  id: string;
  customer_id: string;
  opportunity_id: string | null;
  vehicle: VehicleBrief | null;
  vehicle_price: number;
  down_payment: number;
  financed_amount: number;
  installments: number;
  annual_rate: number;
  monthly_payment: number;
  notes: string | null;
  created_at: string;
}

export interface FinancingSimulation {
  financed_amount: number;
  monthly_payment: number;
  total_paid: number;
  total_interest: number;
  disclaimer: string;
}

export interface Quote {
  id: string;
  number: number;
  customer: CustomerBrief;
  opportunity_id: string | null;
  vehicle: VehicleBrief;
  user: UserBrief | null;
  price: number;
  discount: number;
  trade_in_value: number;
  expenses: number;
  total: number;
  notes: string | null;
  status: string;
  valid_until: string | null;
  financing: Financing | null;
  created_at: string;
}

export interface Match {
  id: string;
  customer: CustomerBrief;
  vehicle: VehicleBrief;
  score: number;
  reasons: string[];
  status: string;
  created_at: string;
}

export interface ScoreHistoryEntry {
  id: string;
  old_score: number;
  new_score: number;
  reason: string | null;
  factors: ScoreFactor[];
  created_at: string;
}

export interface NextBestAction {
  action: string;
  label: string;
  reason: string;
  urgency: "baja" | "media" | "alta";
}

export interface Insight {
  id: string;
  kind: string;
  title: string;
  detail: string;
  reason: string;
  recommendation: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface RadarCustomerItem {
  customer: CustomerBrief;
  subtitle: string | null;
  detail: string;
  assigned_to: string | null;
  metric: string | null;
}

export interface RadarVehicleItem {
  vehicle: VehicleBrief;
  detail: string;
  metric: string | null;
}

export interface RadarMatchItem {
  customer: CustomerBrief;
  vehicle: VehicleBrief;
  score: number;
  detail: string;
}

export interface Radar {
  hot_customers: RadarCustomerItem[];
  urgent_followups: RadarCustomerItem[];
  ghosted_customers: RadarCustomerItem[];
  high_demand_vehicles: RadarVehicleItem[];
  stale_vehicles: RadarVehicleItem[];
  new_matches: RadarMatchItem[];
  probable_closes: RadarCustomerItem[];
}

export interface MetricValue {
  value: number;
  previous: number | null;
  delta_percent: number | null;
}

export interface Overview {
  leads: MetricValue;
  contacted: MetricValue;
  opportunities: MetricValue;
  reservations: MetricValue;
  sales: MetricValue;
  revenue: MetricValue;
  conversion_rate: MetricValue;
  avg_ticket: MetricValue;
  avg_first_response_minutes: MetricValue;
  avg_days_to_sale: MetricValue;
  followups_completed: MetricValue;
  followups_overdue: number;
  leads_by_day: { date: string; leads: number }[];
  sales_by_month: { month: string; sales: number; revenue: number }[];
}

export interface FunnelStage {
  key: string;
  name: string;
  count: number;
  rate_from_previous: number | null;
}

export interface Funnel {
  stages: FunnelStage[];
  total_leads: number;
  won: number;
  overall_rate: number;
}

export interface SellerStats {
  user_id: string;
  full_name: string;
  avatar_color: string;
  leads: number;
  contacted: number;
  opportunities: number;
  sales: number;
  revenue: number;
  conversion_rate: number;
  avg_first_response_minutes: number | null;
  followups_completed: number;
  followups_overdue: number;
  open_opportunities: number;
}

export interface SourceStats {
  source: string;
  leads: number;
  sales: number;
  conversion_rate: number;
}

export interface StockVehicleStat {
  vehicle: VehicleBrief;
  inquiries: number;
  days_in_stock: number;
  conversion_rate: number | null;
}

export interface StockIntel {
  most_inquired: StockVehicleStat[];
  best_conversion: StockVehicleStat[];
  fastest_sold: StockVehicleStat[];
  stale: StockVehicleStat[];
  avg_days_in_stock: number;
  avg_days_sold: number | null;
  inquiries_by_brand: { name: string; inquiries: number }[];
  inquiries_by_model: { name: string; inquiries: number }[];
  inquiries_by_price_range: { range: string; inquiries: number; vehicles: number }[];
}

export interface StockRecommendation {
  title: string;
  detail: string;
  reason: string;
  metric: string | null;
}

export interface PriceInterestPoint {
  range_label: string;
  min_price: number;
  max_price: number;
  vehicles: number;
  inquiries: number;
  avg_days_in_stock: number | null;
  sales: number;
}

export interface Forecast {
  pipeline_total: number;
  weighted_forecast: number;
  by_stage: { key: string; name: string; count: number; total: number; weighted: number }[];
  expected_closes_30d: number;
  disclaimer: string;
}

export interface DashboardCounts {
  to_contact_today: number;
  pending_followups_today: number;
  overdue_followups: number;
  awaiting_reply: number;
  hot_opportunities: number;
  probable_closes: number;
  new_leads_today: number;
}

export interface PriorityCard {
  customer: CustomerBrief;
  icon: "fire" | "warning" | "clock" | "target";
  headline: string;
  vehicle_title: string | null;
  probability: number | null;
  reasons: string[];
  action_label: string;
  action_kind: string;
  assigned_to: string | null;
}

export interface AgendaItem {
  id: string;
  kind: "followup" | "appointment" | "task";
  time: string;
  title: string;
  subtitle: string | null;
  customer_id: string | null;
  status: string;
  type: string;
}

export interface Dashboard {
  counts: DashboardCounts;
  priorities: PriorityCard[];
  agenda: AgendaItem[];
  new_vehicle_matches: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: Record<string, unknown>[];
  actions: { type: string; params?: Record<string, unknown> }[];
  enabled: boolean;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  trigger_entity_type: string | null;
  trigger_entity_id: string | null;
  status: string;
  result: Record<string, unknown>;
  created_at: string;
}

export interface Segment {
  id: string;
  name: string;
  entity: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SearchResultItem {
  kind: "customer" | "vehicle" | "opportunity";
  id: string;
  title: string;
  subtitle: string | null;
  extra: string | null;
}

export interface TimelineItem {
  id: string;
  kind: string;
  icon: string;
  title: string;
  body: string | null;
  actor: string | null;
  direction: string | null;
  created_at: string;
}

export interface AIStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  allow_ai_processing: boolean;
  source: string | null;
}

export interface ChatToolCall {
  tool: string;
  summary: string;
}

export interface ChatResponse {
  reply: string;
  tool_calls: ChatToolCall[];
}

export interface AIUsageSummary {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_calls: number;
  by_feature: { feature: string; calls: number; cost: number; tokens: number }[];
  by_day: { date: string; cost: number }[];
  recent: { feature: string; model: string; tokens: number; cost: number; latency_ms: number; at: string }[];
}

export interface RecommendedVehicle {
  vehicle: VehicleBrief;
  score: number;
  reasons: string[];
}

export interface ImportPreview {
  token: string;
  columns: string[];
  suggested_mapping: Record<string, string>;
  sample_rows: Record<string, string>[];
  total_rows: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  payload: Record<string, unknown>;
}
