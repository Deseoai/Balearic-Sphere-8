import { PitchHub } from "../../components/pitch-hub";
import { TopNav } from "../../components/top-nav";

export default function PitchesPage() {
  return (
    <main className="app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-4">
        <PitchHub />
      </div>
    </main>
  );
}
