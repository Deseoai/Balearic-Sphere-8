import { ProfileSettings } from "../../components/profile-settings";
import { TopNav } from "../../components/top-nav";

export default function SettingsPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-6 pb-28">
        <ProfileSettings />
      </div>
    </main>
  );
}
