import { AppShell } from '@/components/layout/app-shell';

/**
 * Every signed-in page lives in this group, so every one of them gets the
 * sidebar and top bar — no page can forget them.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
