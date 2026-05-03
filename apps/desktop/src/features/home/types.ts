export interface ClientRef {
  id: string;
  name: string;
  slug?: string;
}

export interface NextMeeting {
  id: string;
  title: string;
  client: ClientRef;
  scheduledAt: string | null;
  briefStatus: "prepped" | "not_prepped";
  attendeeCount: number;
  startsInMinutes: number;
}

export interface TodayMeeting {
  id: string;
  title: string;
  client: ClientRef;
  scheduledAt: string | null;
  status: string;
  attendeeCount: number;
  briefStatus: "prepped" | "not_prepped";
}

export interface RecentActivityItem {
  id: string;
  title: string;
  client: ClientRef;
  endedAt: string | null;
  durationMs: number | null;
  decisionsExtracted: number;
  tasksCreated: number;
  commitmentsCaptured: number;
}

export interface OpenCommitmentItem {
  id: string;
  content: string;
  client: ClientRef;
  meetingId: string | null;
  meetingTitle: string | null;
  createdAt: string;
}

export interface HomeData {
  nextMeeting: NextMeeting | null;
  todayMeetings: TodayMeeting[];
  recentActivity: RecentActivityItem[];
  openCommitments: OpenCommitmentItem[];
}
