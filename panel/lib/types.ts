export type ConversationItem = {
  wa_id: string;
  last_text: string | null;
  last_ts: string;
  bot_paused: boolean;
  priority: string | null;
  human_notes: string | null;
  stage: string | null;
};

export type MessageItem = {
  id: string;
  wa_id: string;
  direction: 'in' | 'out';
  text: string | null;
  ts: string;
  stage: string | null;
  source: string | null;
};
