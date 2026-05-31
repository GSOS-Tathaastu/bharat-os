import type { LabelingJobItem } from '@/lib/hooks';

export interface LabelingTaskProps {
  item: LabelingJobItem;
  submitting: boolean;
  onSubmit: (labelValue: unknown) => void;
}
