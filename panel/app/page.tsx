type NavLink = { href: string; label: string };

const NAV_LINKS: NavLink[] = [
  { href: "/conversations", label: "Conversas" },
  { href: "/bases", label: "Bases" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function HomePage() {
  return (
    <main>
      <section className="card">
        <h1>Enova Panel</h1>
        <p>Painel administrativo de operações.</p>
        <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{
                color: "#e6edf3",
                textDecoration: "none",
                border: "1px solid #2b3440",
                borderRadius: "8px",
                padding: "8px 12px",
                background: "#131d29",
                display: "inline-block",
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
