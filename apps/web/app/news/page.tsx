import NewsHub from "../../components/news-hub";
import { TopNav } from "../../components/top-nav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News | Balea Sphere",
  description: "Balearic business news and insights"
};

export default function NewsPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-6 pb-28">
        <NewsHub />
      </div>
    </main>
  );
}
