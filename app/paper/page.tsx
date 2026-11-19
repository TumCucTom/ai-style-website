import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Live } from "@/components/Live";
import { Work } from "@/components/Work";
import { Abstract, Appendix, Education, Experience, OpenSource, Results, TheMap } from "@/components/Sections";
import { Section } from "@/components/Section";
import { ContactGate } from "@/components/ContactGate";

export const metadata = { title: "Tom Bale · the paper" };

export default function Page() {
  return (
    <main>
      <Nav />
      <Hero>
        <p className="font-sans text-[1.45rem] font-bold leading-[1.12] tracking-[-0.03em] md:text-[1.7rem]">
          Product engineer at Anima. I build things end to end and like making computers go fast.
        </p>
        <p className="mt-2.5 hidden text-[0.95rem] leading-snug text-muted sm:block">
          UK team at the ISC&apos;25 Student Cluster Competition. First in Computer Science from Bristol. One Ironman. A
          hundred-odd repos.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#abstract" className="btn btn-solid">
            Read the paper ↓
          </a>
          <a href="#contact" className="btn">
            Get in touch
          </a>
        </div>
      </Hero>

      <Abstract />
      <Live />
      <Work />
      <TheMap />
      <Experience />
      <Education />
      <OpenSource />
      <Results />
      <Appendix />

      <Section
        id="contact"
        n="Correspondence"
        title="Say hello"
        kicker="Exercise 1: solve it for my details and a code to quote. Or skip it and get the details without the code."
      >
        <ContactGate />
      </Section>

      <footer className="border-t border-line py-10">
        <div className="wrap mono flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 text-muted">
          <p>
            © {new Date().getFullYear()} Thomas Bale. Preprint, not peer reviewed.{" "}
            <a className="link text-ink" href="https://github.com/thomas-bale/ai-style-website" target="_blank" rel="noreferrer">
              Source
            </a>
            .
          </p>
          <p>
            Previous editions:{" "}
            <a className="link text-ink" href="https://v1.thomasbale.com" target="_blank" rel="noreferrer">v1</a>,{" "}
            <a className="link text-ink" href="https://v2.thomasbale.com" target="_blank" rel="noreferrer">v2</a>, and{" "}
            <a className="link text-ink" href="https://github.com/thomas-bale/tui-portfolio" target="_blank" rel="noreferrer">one you can ssh into</a>.
          </p>
        </div>
      </footer>
    </main>
  );
}
