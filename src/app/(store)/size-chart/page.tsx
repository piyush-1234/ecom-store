import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Size chart — tees and jeans',
  description:
    'Measurements in centimetres and inches for our oversized and regular t-shirts, and straight, relaxed and wide-leg jeans. Includes how to measure yourself correctly.',
  alternates: { canonical: '/size-chart' },
};

const TEE_SIZES = [
  { size: 'XS', chest: '86–89', length: '66', shoulder: '42' },
  { size: 'S', chest: '91–94', length: '68', shoulder: '44' },
  { size: 'M', chest: '97–100', length: '70', shoulder: '46' },
  { size: 'L', chest: '102–107', length: '72', shoulder: '48' },
  { size: 'XL', chest: '109–114', length: '74', shoulder: '50' },
  { size: 'XXL', chest: '117–122', length: '76', shoulder: '52' },
];

const JEAN_SIZES = [
  { size: '28', waist: '71', hip: '91', thigh: '54', inseam: '81' },
  { size: '30', waist: '76', hip: '96', thigh: '56', inseam: '81' },
  { size: '32', waist: '81', hip: '101', thigh: '58', inseam: '81' },
  { size: '34', waist: '86', hip: '106', thigh: '60', inseam: '81' },
  { size: '36', waist: '91', hip: '111', thigh: '62', inseam: '81' },
  { size: '38', waist: '97', hip: '116', thigh: '64', inseam: '81' },
];

export default function SizeChartPage() {
  return (
    <div className="container-page py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            Size chart
          </li>
        </ol>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Size chart</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        All measurements are for the garment laid flat, in centimetres. If you are between two
        sizes and want a boxier fit, size up. Exchanges are free either way.
      </p>

      <section className="mt-10" aria-labelledby="tees-heading">
        <h2 id="tees-heading" className="text-xl font-semibold tracking-tight">
          T-shirts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Measured across the chest (pit to pit, doubled), full length, and shoulder width.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <caption className="sr-only">T-shirt measurements in centimetres</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-medium">Size</th>
                <th scope="col" className="py-2 pr-4 font-medium">Chest (cm)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Length (cm)</th>
                <th scope="col" className="py-2 font-medium">Shoulder (cm)</th>
              </tr>
            </thead>
            <tbody>
              {TEE_SIZES.map((row) => (
                <tr key={row.size} className="border-b border-border">
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium">{row.size}</th>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.chest}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.length}</td>
                  <td className="py-2.5 text-muted-foreground">{row.shoulder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="jeans-heading">
        <h2 id="jeans-heading" className="text-xl font-semibold tracking-tight">
          Jeans
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Waist is the relaxed waistband measurement. Inseam is 81 cm (32&quot;) as standard —
          hemming to your length is free.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">Jeans measurements in centimetres</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-medium">Size</th>
                <th scope="col" className="py-2 pr-4 font-medium">Waist (cm)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Hip (cm)</th>
                <th scope="col" className="py-2 pr-4 font-medium">Thigh (cm)</th>
                <th scope="col" className="py-2 font-medium">Inseam (cm)</th>
              </tr>
            </thead>
            <tbody>
              {JEAN_SIZES.map((row) => (
                <tr key={row.size} className="border-b border-border">
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium">{row.size}</th>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.waist}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.hip}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.thigh}</td>
                  <td className="py-2.5 text-muted-foreground">{row.inseam}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="measure-heading">
        <h2 id="measure-heading" className="text-xl font-semibold tracking-tight">
          How to measure
        </h2>
        <ol className="mt-3 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Chest:</strong> measure around the fullest part,
            keeping the tape level under your arms. Do not pull it tight.
          </li>
          <li>
            <strong className="text-foreground">Waist:</strong> measure around where your jeans
            normally sit — usually just below the belly button, not at the narrowest point.
          </li>
          <li>
            <strong className="text-foreground">Thigh:</strong> measure around the fullest part of
            your thigh, standing with feet together. This is the measurement that decides whether
            jeans will actually be comfortable.
          </li>
          <li>
            <strong className="text-foreground">Inseam:</strong> measure from the crotch seam down to
            where you want the hem to sit.
          </li>
        </ol>
      </section>
    </div>
  );
}
