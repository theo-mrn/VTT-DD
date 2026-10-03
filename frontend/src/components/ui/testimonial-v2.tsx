import React, { useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Testimonial {
  text: string;
  image: string;
  name: string;
  role: string;
}

// Défilement vertical en keyframes CSS sur transform (composité, hors du
// thread principal), mis en pause quand la section n'est pas à l'écran.
const COLUMN_KEYFRAMES = `@keyframes testimonials-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
@media (prefers-reduced-motion: reduce) { .testimonials-column { animation: none !important; } }`;

const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
  playing: boolean;
}) => {
  if (props.testimonials.length === 0) return null;

  return (
    <div className={props.className}>
      <ul
        style={{
          animation: `testimonials-scroll ${props.duration || 10}s linear infinite`,
          animationPlayState: props.playing ? 'running' : 'paused',
        }}
        className="testimonials-column flex flex-col gap-6 pb-6 bg-transparent list-none m-0 p-0"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <motion.li
                  key={`${index}-${i}`}
                  aria-hidden={index === 1 ? 'true' : 'false'}
                  tabIndex={index === 1 ? -1 : 0}
                  whileHover={{
                    scale: 1.03,
                    y: -8,
                    boxShadow:
                      '0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 20px rgba(201, 169, 101, 0.08)',
                    transition: { type: 'spring', stiffness: 400, damping: 17 },
                  }}
                  whileFocus={{
                    scale: 1.03,
                    y: -8,
                    boxShadow:
                      '0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 20px rgba(201, 169, 101, 0.08)',
                    transition: { type: 'spring', stiffness: 400, damping: 17 },
                  }}
                  className="p-10 rounded-3xl border border-[#c9a965]/10 max-w-xs w-full bg-white/[0.05] transition-colors duration-300 cursor-default select-none group focus:outline-none focus:ring-2 focus:ring-[#c9a965]/20 hover:border-[#c9a965]/25"
                >
                  <blockquote className="m-0 p-0">
                    <p
                      className={cn(
                        'text-[#f5edd6]/70 leading-relaxed font-normal m-0 transition-colors duration-300',
                        'font-logo',
                      )}
                    >
                      &ldquo;{text}&rdquo;
                    </p>
                    <footer className="flex items-center gap-3 mt-6">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-[#c9a965] flex items-center justify-center overflow-hidden text-[#0c0c0e] font-bold ring-2 ring-[#c9a965]/20 group-hover:ring-[#c9a965]/40 transition-shadow duration-300">
                        {image ? (
                          <img src={image} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <cite
                          className={cn(
                            'font-semibold not-italic tracking-tight leading-5 text-white transition-colors duration-300',
                            'font-logo',
                          )}
                        >
                          {name}
                        </cite>
                      </div>
                    </footer>
                  </blockquote>
                </motion.li>
              ))}
            </React.Fragment>
          )),
        ]}
      </ul>
    </div>
  );
};

export const TestimonialsSection = () => {
  const [dbTestimonials, setDbTestimonials] = useState<Testimonial[]>([]);
  const sectionRef = React.useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { margin: '100px' });

  // Les témoignages viennent des retours des joueurs : la section reste masquée
  // tant que le service « retours » n'existe pas dans la nouvelle stack.
  useEffect(() => {
    setDbTestimonials([]);
  }, []);

  if (dbTestimonials.length === 0) return null;

  const firstColumn = dbTestimonials.slice(0, Math.ceil(dbTestimonials.length / 3));
  const secondColumn = dbTestimonials.slice(
    Math.ceil(dbTestimonials.length / 3),
    Math.ceil((dbTestimonials.length * 2) / 3),
  );
  const thirdColumn = dbTestimonials.slice(Math.ceil((dbTestimonials.length * 2) / 3));

  return (
    <section
      ref={sectionRef}
      aria-labelledby="testimonials-heading"
      className="bg-transparent py-24 relative overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0, y: 50, rotate: -2 }}
        whileInView={{ opacity: 1, y: 0, rotate: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{
          duration: 1.2,
          ease: [0.16, 1, 0.3, 1],
          opacity: { duration: 0.8 },
        }}
        className="container px-4 z-10 mx-auto"
      >
        <div className="flex flex-col items-center justify-center max-w-[540px] mx-auto mb-16">
          <div className="flex justify-center">
            <div
              className={cn(
                'border border-[#c9a965]/30 py-1 px-4 rounded-full text-xs font-semibold tracking-wide uppercase text-[#c9a965] bg-[#c9a965]/5 transition-colors',
                'font-logo',
              )}
            >
              Témoignages
            </div>
          </div>

          <h2
            id="testimonials-heading"
            className={cn(
              'text-4xl md:text-5xl font-extrabold tracking-tight mt-6 text-center gold-text-gradient transition-colors',
              'font-logo',
            )}
          >
            Ce que disent les aventuriers
          </h2>
          <p
            className={cn(
              'text-center mt-5 text-white/50 text-lg leading-relaxed max-w-sm transition-colors',
              'font-logo',
            )}
          >
            Découvrez les retours de la communauté sur leur expérience YNER.
          </p>
        </div>

        <div
          className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] max-h-[740px] overflow-hidden"
          role="region"
          aria-label="Scrolling Testimonials"
        >
          <style>{COLUMN_KEYFRAMES}</style>
          <TestimonialsColumn testimonials={firstColumn} duration={15} playing={inView} />
          {secondColumn.length > 0 && (
            <TestimonialsColumn
              testimonials={secondColumn}
              className="hidden md:block"
              duration={19}
              playing={inView}
            />
          )}
          {thirdColumn.length > 0 && (
            <TestimonialsColumn
              testimonials={thirdColumn}
              className="hidden lg:block"
              duration={17}
              playing={inView}
            />
          )}
        </div>
      </motion.div>
    </section>
  );
};
