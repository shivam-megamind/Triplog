import { PublicChapter } from "@/components/public-chapter";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicChapter token={token} />;
}

