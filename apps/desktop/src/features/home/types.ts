export interface ClientRef {
  id: string;
  name: string;
  slug?: string;
}

export interface NextMeeting {
  attendeeCount: number;
  briefStatus: "prepped" | "not_prepped";
  client: ClientRef;
  id: string;
  scheduledAt: string | null;
  startsInMinutes: number;
  title: string;
}

export interface TodayMeeting {
  attendeeCount: number;
  briefStatus: "prepped" | "not_prepped";
  client: ClientRef;
  id: string;
  scheduledAt: string | null;
  status: string;
  title: string;
}

export interface RecentActivityItem {
  client: ClientRef;
  commitmentsCaptured: number;
  decisionsExtracted: number;
  durationMs: number | null;
  endedAt: string | null;
  id: string;
  tasksCreated: number;
  title: string;
}

export interface OpenCommitmentItem {
  client: ClientRef;
  content: string;
  createdAt: string;
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
}

export interface HomeData {
  nextMeeting: NextMeeting | null;
  openCommitments: OpenCommitmentItem[];
  recentActivity: RecentActivityItem[];
  todayMeetings: TodayMeeting[];
}
