import { redirect } from "next/navigation";
import { naoIndexar } from "@/lib/seo";

export const metadata = naoIndexar;

export default function LoginRedirect() {
  redirect("/");
  return null;
}
