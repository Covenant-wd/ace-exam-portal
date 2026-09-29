import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { CONTACT, type LegalBlock, type LegalDocumentData } from "@/lib/legalContent";

interface LegalDocumentProps {
  doc: LegalDocumentData;
  /** Link to the sibling document, shown in the footer. */
  related: { label: string; to: string };
}

function ContactCard() {
  const telHref = `tel:${CONTACT.phone.replace(/[^+\d]/g, "")}`;
  return (
    <div className="rounded-xl border bg-muted/40 p-5">
      <p className="font-semibold">{CONTACT.name}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="w-20 text-muted-foreground">Website</dt>
          <dd>
            <a href={CONTACT.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {CONTACT.website}
            </a>
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="w-20 text-muted-foreground">Email</dt>
          <dd>
            <a href={`mailto:${CONTACT.email}`} className="text-blue-600 hover:underline">
              {CONTACT.email}
            </a>
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="w-20 text-muted-foreground">Phone</dt>
          <dd>
            <a href={telHref} className="text-blue-600 hover:underline">
              {CONTACT.phone}
            </a>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p className="leading-7 text-foreground/80">{block.text}</p>;
    case "h3":
      return <h3 className="pt-2 text-base font-semibold text-foreground">{block.text}</h3>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-6 leading-7 text-foreground/80 marker:text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <div className="rounded-lg border-l-4 border-blue-600 bg-muted/60 px-4 py-3 font-medium text-foreground">
          {block.text}
        </div>
      );
    case "contact":
      return <ContactCard />;
    default:
      return null;
  }
}

export default function LegalDocument({ doc, related }: LegalDocumentProps) {
  // Open at the top when arriving from another page, and give the tab a proper title.
  useEffect(() => {
    window.scrollTo(0, 0);
    const previousTitle = document.title;
    document.title = `${doc.title} | Academia HQ`;
    return () => {
      document.title = previousTitle;
    };
  }, [doc.title]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800">
              <GraduationCap className="h-4 w-4 text-white" />
            </span>
            <span className="font-bold tracking-tight">
              Academia <span className="text-blue-600">HQ</span>
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        {/* ── Title ── */}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: {doc.effectiveDate}</p>

        <div className="mt-6 space-y-4">
          {doc.intro.map((text) => (
            <p key={text} className="leading-7 text-foreground/80">
              {text}
            </p>
          ))}
        </div>

        {/* ── Table of contents ── */}
        <nav aria-label="Contents" className="mt-10 rounded-xl border bg-muted/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contents</h2>
          <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {doc.sections.map((section, i) => (
              <li key={section.title}>
                <a href={`#section-${i + 1}`} className="text-foreground/80 hover:text-blue-600 hover:underline">
                  {i + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Sections ── */}
        <div className="mt-12 space-y-12">
          {doc.sections.map((section, i) => (
            <section key={section.title} id={`section-${i + 1}`} className="scroll-mt-20 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">
                {i + 1}. {section.title}
              </h2>
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </section>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Academia HQ. All rights reserved.</p>
          <Link to={related.to} className="text-blue-600 hover:underline">
            {related.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
