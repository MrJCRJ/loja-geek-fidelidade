import { useCallback, useState } from "react";
import OfflineBanner from "../components/OfflineBanner";
import { useDashboardCheckout } from "../hooks/useDashboardCheckout";
import { useDashboardData } from "../hooks/useDashboardData";
import { useProximityField } from "../hooks/useProximityField";
import { useReveal } from "../hooks/useReveal";
import { DashboardAlerts } from "../dashboard/DashboardAlerts";
import { DashboardBalancePanel } from "../dashboard/DashboardBalancePanel";
import { DashboardCheckoutSection } from "../dashboard/DashboardCheckoutSection";
import { DashboardHeader } from "../dashboard/DashboardHeader";
import { DashboardHistory } from "../dashboard/DashboardHistory";
import { DashboardSkeleton } from "../dashboard/DashboardSkeleton";

export default function DashboardPage() {
  const rootRef = useReveal();
  useProximityField(rootRef);
  const { me, setMe, catalog, orders, timeLedger, loadError, load } = useDashboardData();
  const [error, setError] = useState("");
  const [showReview, setShowReview] = useState(false);

  const onPaid = useCallback(() => setShowReview(true), []);

  const { msg, busy, pix, setPix, buyHours, buySub } = useDashboardCheckout({
    load,
    setMe,
    setError,
    onPaid,
  });

  if (!me) {
    return <DashboardSkeleton rootRef={rootRef} loadError={loadError} />;
  }

  const checkoutEnabled = catalog?.checkoutEnabled === true;
  const checkoutDemo = catalog?.demo === true;
  const pixMode = catalog?.payments?.pixEnabled;

  return (
    <div className="shell shell--ambient page-in" ref={rootRef}>
      <OfflineBanner />
      <DashboardHeader me={me} />
      <DashboardAlerts
        me={me}
        error={error}
        msg={msg}
        showReview={showReview}
        checkoutDemo={checkoutDemo}
        pix={pix}
        onDismissReview={() => setShowReview(false)}
        onClosePix={() => setPix(null)}
      />
      <DashboardBalancePanel me={me} />
      <DashboardCheckoutSection
        me={me}
        catalog={catalog}
        checkoutEnabled={checkoutEnabled}
        checkoutDemo={checkoutDemo}
        pixMode={pixMode}
        busy={busy}
        onBuyHours={buyHours}
        onBuySub={buySub}
      />
      <DashboardHistory orders={orders} timeLedger={timeLedger} />
    </div>
  );
}
