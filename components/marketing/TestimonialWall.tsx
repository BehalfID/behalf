import Image from "next/image";
import { Section } from "@/components/design-system/MarketingLayout";
import { TESTIMONIALS, hasTestimonials } from "@/lib/testimonials";

/**
 * Named-user proof wall. Renders nothing until lib/testimonials.ts holds real
 * quotes — see the note there. An empty strip is better than a fabricated one
 * on a product whose whole pitch is that it does not overstate what it enforces.
 */
export function TestimonialWall() {
  if (!hasTestimonials()) return null;

  return (
    <Section wide className="env-stone">
      <div className="max-w-2xl">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">In production</div>
        <h2 className="display-lg mt-5">Teams running this against real agent traffic.</h2>
      </div>
      <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((testimonial) => (
          <li key={testimonial.name + testimonial.role} className="rounded-xl border bg-surface p-6">
            <blockquote className="text-[15px] leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</blockquote>
            <div className="mt-6 flex items-center gap-3">
              {testimonial.photo ? (
                <Image
                  src={testimonial.photo}
                  alt={testimonial.photoAlt || `${testimonial.name}, ${testimonial.role}`}
                  width={40}
                  height={40}
                  className="size-10 rounded-full object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{testimonial.name}</div>
                <div className="text-[13px] text-muted-foreground">{testimonial.role}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
