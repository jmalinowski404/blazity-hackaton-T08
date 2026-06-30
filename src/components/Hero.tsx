import { BRAND_PROFILE } from "@/lib/brand";

export function Hero() {
  return (
    <section className="shell hero">
      <h1>
        Keep every word in <span className="text-decoration">your</span> voice.
      </h1>
      <p className="lede">
        Connect a channel or paste copy, run the check, and Tono reads it against
        the voice you&rsquo;ve defined &mdash; marks every place it drifts off-brand,
        explains why, rewrites it back into tune, and posts the fix back.
      </p>
    </section>
  );
}
