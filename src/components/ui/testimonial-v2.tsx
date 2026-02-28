import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Aclonica } from "next/font/google";

const aclonica = Aclonica({
  weight: '400',
  subsets: ['latin'],
})

// --- Types ---
interface Testimonial {
  text: string;
  image: string;
  name: string;
  role: string;
}

// --- Sub-Components ---
const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
}) => {
  if (props.testimonials.length === 0) return null;

  return (
    <div className={props.className}>
      <motion.ul
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6 bg-transparent transition-colors duration-300 list-none m-0 p-0"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <motion.li
                  key={`${index}-${i}`}
                  aria-hidden={index === 1 ? "true" : "false"}
                  tabIndex={index === 1 ? -1 : 0}
                  whileHover={{
                    scale: 1.03,
                    y: -8,
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                    transition: { type: "spring", stiffness: 400, damping: 17 }
                  }}
                  whileFocus={{
                    scale: 1.03,
                    y: -8,
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                    transition: { type: "spring", stiffness: 400, damping: 17 }
                  }}
                  className="p-10 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-lg shadow-black/5 max-w-xs w-full bg-white dark:bg-neutral-900 transition-all duration-300 cursor-default select-none group focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <blockquote className="m-0 p-0">
                    <p className={cn("text-neutral-600 dark:text-neutral-400 leading-relaxed font-normal m-0 transition-colors duration-300", aclonica.className)}>
                      "{text}"
                    </p>
                    <footer className="flex items-center gap-3 mt-6">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--accent-brown)] flex items-center justify-center overflow-hidden text-white font-bold ring-2 ring-neutral-100 dark:ring-neutral-800 group-hover:ring-primary/30 transition-all duration-300">
                        {image ? (
                          <img src={image} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <cite className={cn("font-semibold not-italic tracking-tight leading-5 text-neutral-900 dark:text-white transition-colors duration-300", aclonica.className)}>
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
      </motion.ul>
    </div>
  );
};

export const TestimonialsSection = () => {
  const [dbTestimonials, setDbTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "feedback"),
      orderBy("createdAt", "desc"),
      limit(15)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const results = await Promise.all(snapshot.docs.map(async (fDoc) => {
        const data = fDoc.data();
        let profilePic = "";

        if (data.userId) {
          try {
            const userDoc = await getDoc(doc(db, "users", data.userId));
            if (userDoc.exists()) {
              profilePic = userDoc.data().pp || "";
            }
          } catch (e) {
            console.error("Error fetching user PP:", e);
          }
        }

        return {
          text: data.message || "",
          name: data.userName || "Anonyme",
          role: "",
          image: profilePic
        };
      }));
      setDbTestimonials(results);
    });

    return () => unsubscribe();
  }, []);

  if (dbTestimonials.length === 0) return null;

  // Split into columns if we have enough
  const firstColumn = dbTestimonials.slice(0, Math.ceil(dbTestimonials.length / 3));
  const secondColumn = dbTestimonials.slice(Math.ceil(dbTestimonials.length / 3), Math.ceil(dbTestimonials.length * 2 / 3));
  const thirdColumn = dbTestimonials.slice(Math.ceil(dbTestimonials.length * 2 / 3));

  return (
    <section
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
          opacity: { duration: 0.8 }
        }}
        className="container px-4 z-10 mx-auto"
      >
        <div className="flex flex-col items-center justify-center max-w-[540px] mx-auto mb-16">
          <div className="flex justify-center">
            <div className={cn("border border-neutral-300 dark:border-neutral-700 py-1 px-4 rounded-full text-xs font-semibold tracking-wide uppercase text-neutral-600 dark:text-neutral-400 bg-neutral-100/50 dark:bg-neutral-800/50 transition-colors", aclonica.className)}>
              Témoignages
            </div>
          </div>

          <h2 id="testimonials-heading" className={cn("text-4xl md:text-5xl font-extrabold tracking-tight mt-6 text-center text-neutral-900 dark:text-white transition-colors", aclonica.className)}>
            Ce que disent les aventuriers
          </h2>
          <p className={cn("text-center mt-5 text-neutral-500 dark:text-neutral-400 text-lg leading-relaxed max-w-sm transition-colors", aclonica.className)}>
            Découvrez les retours de la communauté sur leur expérience YNER.
          </p>
        </div>

        <div
          className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] max-h-[740px] overflow-hidden"
          role="region"
          aria-label="Scrolling Testimonials"
        >
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          {secondColumn.length > 0 && (
            <TestimonialsColumn testimonials={secondColumn} className="hidden md:block" duration={19} />
          )}
          {thirdColumn.length > 0 && (
            <TestimonialsColumn testimonials={thirdColumn} className="hidden lg:block" duration={17} />
          )}
        </div>
      </motion.div>
    </section>
  );
};
