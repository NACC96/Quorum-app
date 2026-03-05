import Link from "next/link";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";

const METRIC_ITEMS = [
  { label: "council members", value: "2-8" },
  { label: "deliberation rounds", value: "0-3" },
  { label: "execution mode", value: "parallel" },
  { label: "provider gateway", value: "openrouter" },
  { label: "storage", value: "local" },
  { label: "verdict model", value: "configurable" }
];

export default function HomePage() {
  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="landing" />

      <main className="main-shell">
        <section className="hero-section">
          <p className="hero-kicker">Council-Grade Deliberation</p>
          <h1 className="hero-title">
            Ask once. Let a council reason. Receive a final
            <span className="shimmer-word"> verdict.</span>
          </h1>
          <p className="hero-copy">
            Quorum orchestrates multi-model independent reasoning, structured deliberation, and
            judge synthesis in one controlled workflow.
          </p>
          <div className="hero-actions">
            <Link href="/council" className="shiny-button">
              <span>Start Council Session</span>
            </Link>
            <a href="#features" className="text-link">
              Learn More
            </a>
          </div>
        </section>

        <section className="metric-ticker" aria-label="System metrics">
          <div className="ticker-track">
            {[...METRIC_ITEMS, ...METRIC_ITEMS].map((item, index) => (
              <div className="ticker-item" key={`${item.label}-${index}`}>
                <span className="ticker-label">{item.label}</span>
                <span className="ticker-value">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="feature-grid" id="features">
          <article className="feature-card">
            <div className="feature-icon">01</div>
            <h3>Parallel Independent Round</h3>
            <p>
              Every council member receives the same question and context simultaneously, with
              isolated reasoning before group influence.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">02</div>
            <h3>Structured Deliberation Cycles</h3>
            <p>
              Models critique and refine each other over configurable rounds, creating explicit
              tradeoff analysis and stronger convergence.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">03</div>
            <h3>Judge Verdict Synthesis</h3>
            <p>
              A dedicated judge evaluates the full transcript and returns consensus, disagreements,
              blind spots, and an action-ready final verdict.
            </p>
          </article>
        </section>

        <section className="code-block" id="architecture">
          <div className="code-toolbar">
            <div className="window-controls" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <span className="code-file">quorum.pipeline.ts</span>
            <button type="button" className="code-copy" disabled>
              COPY
            </button>
          </div>
          <pre>
            <code>
{`const council = await runIndependentRound(models, question, context);

for (let i = 0; i < deliberationRounds; i++) {
  const prior = rounds[rounds.length - 1];
  const deliberation = await runDeliberationRound(models, prior, question, context);
  rounds.push(deliberation);
}

const verdict = await runJudgeRound(judgeModel, rounds, question, context);
return { rounds, verdict };`}
            </code>
          </pre>
        </section>
      </main>

      <Footer />
    </div>
  );
}
