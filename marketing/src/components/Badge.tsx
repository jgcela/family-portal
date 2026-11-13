import { availabilityLabel, features, type Availability, type FeatureId } from '@/config/site';

export function StatusBadge({ status }: { status: Availability }) {
  return <span className={`badge badge-${status}`}>{availabilityLabel[status]}</span>;
}

export function FeatureBadge({ id }: { id: FeatureId }) {
  return <StatusBadge status={features[id].status} />;
}

export function SampleBadge({ children = 'Sample data' }: { children?: React.ReactNode }) {
  return <span className="badge badge-sample">{children}</span>;
}
