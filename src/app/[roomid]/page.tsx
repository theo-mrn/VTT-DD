import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ roomid: string }> }) {
  const { roomid } = await params;
  redirect(`/${roomid}/map`);
}