import Image from "next/image";
import { TESTIMONIALS, hasTestimonials } from "@/lib/testimonials";

/**
 * Design-partner quotes in the plain /design-partners page style.
 * Renders nothing until lib/testimonials.ts holds real quotes.
 */
export function DesignPartnerQuotes() {
  if (!hasTestimonials()) return null;

  return (
    <>
      <h2>Who is already using this</h2>
      <ul className="dp-quotes">
        {TESTIMONIALS.map((testimonial) => (
          <li key={testimonial.name + testimonial.role} className="dp-quote">
            <blockquote>&ldquo;{testimonial.quote}&rdquo;</blockquote>
            <div className="dp-quote__person">
              {testimonial.photo ? (
                <Image
                  src={testimonial.photo}
                  alt={testimonial.photoAlt || `${testimonial.name}, ${testimonial.role}`}
                  width={40}
                  height={40}
                  className="dp-quote__avatar"
                />
              ) : null}
              <span>
                <strong>{testimonial.name}</strong>
                <small>{testimonial.role}</small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
