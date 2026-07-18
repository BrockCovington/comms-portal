import { redirect } from "next/navigation";

// /admin is now split into dedicated tool pages; land on the first one.
export default function AdminPage() {
  redirect("/admin/users");
}
