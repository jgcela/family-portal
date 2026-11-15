export const ITEM_STATUS: Record<string, string> = {
  new: 'Received',
  in_progress: 'In progress',
  waiting: 'Waiting for you',
  resolved: 'Done',
  cancelled: 'Cancelled',
};
export const KIND: Record<string, string> = { attendance: 'Attendance', question: 'Question', request: 'Request' };
export { STATUS_LABEL as NOTICE_STATUS, TYPE_LABEL, REASON_LABEL } from '@/server/services/attendance';
