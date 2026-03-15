import NewsHub from "../../components/news-hub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News | Balea Sphere",
  description: "Balearic business news and insights"
};

export default function NewsPage() {
  return <NewsHub />;
}
