import DealRoomHub from "../../components/deal-room-hub";
import { TopNav } from "../../components/top-nav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deal Rooms | Balea Sphere",
  description: "Private deal collaboration spaces"
};

export default function DealRoomPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-6 pb-28">
        <DealRoomHub />
      </div>
    </main>
  );
}
