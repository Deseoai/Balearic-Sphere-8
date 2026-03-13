import { NetworkMapHub } from "../../components/network-map-hub";
import { TopNav } from "../../components/top-nav";

export default function NetworkPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-4">
        <NetworkMapHub />
      </div>
    </main>
  );
}
