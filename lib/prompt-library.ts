// ─────────────────────────────────────────────────────────────
// RoundTable — Prompt Library
// ─────────────────────────────────────────────────────────────
// A small curated set of demo prompts. Shown as chips under the
// textarea when it is empty so first-time visitors have a
// one-click entry point into the consensus flow.

export interface PromptPreset {
  id: string;
  label: string;
  category: "Strategy" | "Engineering" | "Ethics" | "Science";
  prompt: string;
}

export const PROMPT_LIBRARY: PromptPreset[] = [
  {
    id: "microservices-day-one",
    label: "Microservices from day one?",
    category: "Engineering",
    prompt:
      "Should an early-stage startup use a microservices architecture from day one, or begin with a modular monolith and decompose later? Consider team size, operational complexity, and product-market-fit risk.",
  },
  {
    id: "ai-coding-assistants",
    label: "AI coding assistants: net positive?",
    category: "Strategy",
    prompt:
      "Are AI coding assistants (Copilot, Cursor, Claude Code, etc.) a net productivity gain for experienced engineers, or do they introduce subtle quality and dependency risks that outweigh the speedup?",
  },
  {
    id: "remote-vs-office",
    label: "Full remote vs hybrid office",
    category: "Strategy",
    prompt:
      "For a 50-person engineering org building a consumer SaaS product, is full remote or a 3-day hybrid model more likely to produce durable high-quality output over a 3-year horizon?",
  },
  {
    id: "rust-vs-go",
    label: "Rust vs Go for a new backend",
    category: "Engineering",
    prompt:
      "A team of five backend engineers (3 Go, 2 Python) is starting a new latency-sensitive service. Should they pick Rust or Go? Weigh ecosystem maturity, hiring, performance ceiling, and onboarding cost.",
  },
  {
    id: "llm-dataset-licensing",
    label: "LLM training on licensed data",
    category: "Ethics",
    prompt:
      "Should commercial LLM providers be legally required to train exclusively on explicitly licensed data, even if it means losing access to most of the public web? Consider innovation, creator rights, and competitive dynamics.",
  },
  {
    id: "carbon-capture",
    label: "Direct air capture viability",
    category: "Science",
    prompt:
      "Given current cost curves and energy requirements, is direct-air carbon capture a credible climate solution by 2040, or is it a distraction from faster mitigation pathways? Evaluate the evidence.",
  },
  {
    id: "universal-basic-income",
    label: "UBI under AI automation",
    category: "Ethics",
    prompt:
      "If AI automates 30% of knowledge-work tasks by 2035, is a universal basic income the correct policy response, or would narrower interventions (retraining, wage insurance, job guarantees) be more effective?",
  },
  {
    id: "nuclear-renaissance",
    label: "Should we bet on nuclear?",
    category: "Science",
    prompt:
      "Should industrialised nations aggressively restart nuclear fission build-out (SMRs and conventional) as a primary pillar of decarbonisation, or continue prioritising wind, solar, and storage?",
  },
];
