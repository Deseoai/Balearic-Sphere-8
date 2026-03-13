import { EventsHub } from "../../components/events-hub";
import { TopNav } from "../../components/top-nav";

export default function EventsPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-6 pb-28">
        <EventsHub />
      </div>
    </main>
  );
}
