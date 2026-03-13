import { EliteCircleHub } from "../../components/elite-circle-hub";
import { TopNav } from "../../components/top-nav";

export default function EliteCirclePage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-6 pb-28">
        <EliteCircleHub />
      </div>
    </main>
  );
}
