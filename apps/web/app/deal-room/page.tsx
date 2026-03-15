import DealRoomHub from "../../components/deal-room-hub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deal Rooms | Balea Sphere",
  description: "Private deal collaboration spaces"
};

export default function DealRoomPage() {
  return <DealRoomHub />;
}
