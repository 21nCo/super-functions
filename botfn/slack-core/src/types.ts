export interface SlackEvent {
  token: string;
  team_id: string;
  api_app_id: string;
  event: any;
  type: string;
  event_id: string;
  event_time: number;
}

export interface SlackSlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}
