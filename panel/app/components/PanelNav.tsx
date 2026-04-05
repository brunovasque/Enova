"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Conversas", href: "/conversations" },
  { label: "Bases", href: "/bases" },
  { label: "Atendimento", href: "/atendimento" },
  { label: "CRM", href: "/crm" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Incidentes", href: "/incidentes" },
  { label: "ENOVA IA", href: "/enova-ia" },
] as const;

export function PanelNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: "4px",
        alignItems: "center",
        padding: "6px 16px",
        background: "#0a0a0c",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexWrap: "wrap",
      }}
    >
      {NAV_LINKS.map(({ label, href }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: "6px",
              fontSize: "0.82rem",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#5eaead" : "#8899aa",
              background: isActive ? "rgba(94,174,173,0.10)" : "transparent",
              border: isActive ? "1px solid rgba(94,174,173,0.25)" : "1px solid transparent",
              textDecoration: "none",
              transition: "color 0.15s, background 0.15s, border 0.15s",
              letterSpacing: "0.01em",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
