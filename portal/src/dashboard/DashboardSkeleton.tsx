import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";

type Props = {
  loadError?: string;
};

export function DashboardSkeleton({ loadError }: Props) {
  return (
    <>
      <OfflineBanner />
      <BrandHeader size="sm" />
      {loadError ? (
        <p className="muted">{loadError}</p>
      ) : (
        <>
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--block" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--line" style={{ width: "60%" }} />
        </>
      )}
    </>
  );
}
