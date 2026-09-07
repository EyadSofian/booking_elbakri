import { redirect } from 'next/navigation';

/**
 * The root is not a landing page — this is an internal tool.
 *
 * Anyone arriving here is sent to the dashboard, which redirects on to the
 * login screen if there is no session.
 */
export default function RootPage() {
  redirect('/dashboard');
}
