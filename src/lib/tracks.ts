// Tracks are fixed in code; subjects and chapters are managed in admin.
export const TRACK_IDS = ['class-10', 'class-11', 'class-12', 'engineering', 'pro'] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const TRACKS: Record<TrackId, { label: string; blurb: string }> = {
  'class-10': { label: 'Class 10', blurb: 'Maths and Computer Science' },
  'class-11': { label: 'Class 11', blurb: 'Maths and Computer Science' },
  'class-12': { label: 'Class 12', blurb: 'Maths and Computer Science' },
  engineering: { label: 'Engineering', blurb: 'C, C++, Java and Python' },
  pro: { label: 'Professionals', blurb: 'AI, cloud and backend engineering' },
};

export function isTrackId(value: string | undefined): value is TrackId {
  return !!value && (TRACK_IDS as readonly string[]).includes(value);
}
