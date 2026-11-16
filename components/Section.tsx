export function Section({
  id,
  n,
  title,
  kicker,
  wide = false,
  children,
}: {
  id: string;
  n: string;
  title: string;
  kicker?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`sec ${wide ? "sec-wide" : ""}`}>
      <div className="wrap sec-grid">
        <header className="sec-head">
          <div>
            <p className="sec-n">{n}</p>
            <h2 className="sec-title">{title}</h2>
          </div>
          {kicker && <p className="sec-kicker">{kicker}</p>}
        </header>
        <div className="sec-body">{children}</div>
      </div>
    </section>
  );
}
