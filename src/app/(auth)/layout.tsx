import Link from 'next/link';
import { siteConfig } from '@/lib/config/site';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="container-page flex h-16 items-center">
          <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
            {siteConfig.name}
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-border bg-card p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
