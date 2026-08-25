import { RefObject } from "react";
import BrandHeader from "../components/BrandHeader";
import OfflineBanner from "../components/OfflineBanner";

type Props = {
  rootRef: RefObject<HTMLDivElement | null>;
  loadError?: string;
};

export function DashboardSkeleton({ rootRef, loadError }: Props) {
  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
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
    </div>
  );
}
