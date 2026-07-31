import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth/authService'
import { PanelLayout } from '@/components/layout/PanelLayout'
import { cookies } from 'next/headers'

export default async function PanelRootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  return <PanelLayout>{children}</PanelLayout>
}
