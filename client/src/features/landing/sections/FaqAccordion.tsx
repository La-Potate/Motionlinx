import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';

const FAQS = [
  {
    q: 'How do credits work?',
    a: 'Each plan refills monthly. Credits are spent per API call — keyword lookups, schema autofills, content generations and audits each have a stated cost shown in the in-app activity log. Unused credits do not roll over, but top-ups (1,000 credits for $79) never expire.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Every project, note, audit report and generated article is stored under your USERDATA_PATH directory. The whole directory can be archived from the Settings page or by stopping the server and copying the folder. We never lock you in.',
  },
  {
    q: 'What happens to my workspace if I downgrade?',
    a: 'Your projects, notes, audit history and saved tool configurations survive plan changes. Only the monthly credit ceiling and seat count adjust. If you re-upgrade later, everything resumes exactly where it was.',
  },
  {
    q: 'Do you train models on my content?',
    a: 'No. Content generation calls go through the Anthropic API or DataForSEO; neither is used to train models, and we don’t maintain a separate model. Your projects stay yours, with the audit trail to prove it.',
  },
  {
    q: 'Is there an uptime guarantee?',
    a: 'The platform targets 99.98% uptime measured monthly. Status is shown in the footer dot, and incidents are posted to the release notes page within 24 hours of resolution.',
  },
  {
    q: 'Can I bring my own Claude / DataForSEO keys?',
    a: 'Yes — admins can configure shared workspace keys in Settings → API keys. Tools use the workspace keys by default; individual user overrides will arrive in a later release.',
  },
];

export function FaqAccordion() {
  return (
    <section className="py-28 sm:py-36 border-t border-border">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-14">
          <SectionEyebrow>Frequently asked</SectionEyebrow>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em]">
            The questions that actually come up.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            If something here doesn&rsquo;t answer your question, drop us a
            line at the contact link below.
          </p>
        </Reveal>

        <Reveal>
          <div className="rounded-2xl border border-border bg-surface px-6 sm:px-8">
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((item, i) => (
                <AccordionItem key={item.q} value={`item-${i}`}>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                  <AccordionContent>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
