import { naoIndexar } from "@/lib/seo";

export const metadata = naoIndexar;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
