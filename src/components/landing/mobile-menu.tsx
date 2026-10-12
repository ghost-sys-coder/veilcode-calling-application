"use client";
import { useState } from "react";
import Link from "next/link";
import { SignedOut } from "@clerk/nextjs";
import { ArrowUpRight, Menu, X } from "lucide-react";

const navItems = [
  { href: "#why-veilcall", label: "Why VeilCall" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#roadmap", label: "What comes next" },
];

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  return <div className="mobile-navigation">
    <button type="button" className="mobile-toggle" onClick={() => setIsOpen((value) => !value)}
      aria-expanded={isOpen} aria-controls="mobile-navigation-panel" aria-label={isOpen ? "Close menu" : "Open menu"}>
      {isOpen ? <X size={21} strokeWidth={1.8} /> : <Menu size={21} strokeWidth={1.8} />}
    </button>
    {isOpen && <nav id="mobile-navigation-panel" className="mobile-panel" aria-label="Mobile navigation">
      {navItems.map((item) => <Link key={item.href} href={`/${item.href}`} onClick={() => setIsOpen(false)}>{item.label}</Link>)}
      <SignedOut><Link href="/sign-in" onClick={() => setIsOpen(false)}>Sign in</Link></SignedOut>
      <Link href="/console" prefetch={false} className="mobile-panel-cta" onClick={() => setIsOpen(false)}>Open console <ArrowUpRight size={17}/></Link>
    </nav>}
  </div>;
}
