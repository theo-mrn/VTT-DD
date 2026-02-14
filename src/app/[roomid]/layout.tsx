import { SettingsProvider } from '@/contexts/SettingsContext';

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SettingsProvider>
      {children}
    </SettingsProvider>
  )
}
