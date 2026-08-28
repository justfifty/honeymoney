import Skeleton from "../Skeleton";

// /record is the daily-capture screen and the app's default landing, so this is
// the skeleton most people see most often: one input card, then recent rows.
export default function Loading() {
  return <Skeleton width="max-w-lg" cards={1} rows={4} />;
}
