import { SiteHeader } from '@/components/store/site-header';
import { SiteFooter } from '@/components/store/site-footer';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
