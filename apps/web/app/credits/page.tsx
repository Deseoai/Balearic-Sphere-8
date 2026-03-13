import { CreditsStudio } from "../../components/credits-studio";
import { TopNav } from "../../components/top-nav";

export default function CreditsPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-4">
        <CreditsStudio />
      </div>
    </main>
  );
}
