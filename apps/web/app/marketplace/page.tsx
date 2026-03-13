import { MarketplaceHub } from "../../components/marketplace-hub";
import { TopNav } from "../../components/top-nav";

export default function MarketplacePage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-4">
        <MarketplaceHub />
      </div>
    </main>
  );
}
