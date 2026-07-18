import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Mail, Download, Smartphone, CheckCircle2, ShieldCheck, FileText, Cpu, Languages, Layers, MousePointer2 } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import heroPhone from './assets/hero-phone.png'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const translations = {
  sq: {
    nav: {
      howItWorks: "Si funksionon",
      features: "Veçoritë",
      audience: "Për kë është",
      getApp: "Merr aplikacionin",
    },
    hero: {
      badge: "iOS · TestFlight & App Store",
      title: "Faturimi",
      subtitle: "Fatura profesionale, direkt nga telefoni.",
      description: "Krijoni, ndani dhe menaxhoni fatura elegante në sekonda — të projektuara për studio mode, freelancer dhe biznese të vogla.",
      ctaPrimary: "Shkarko në App Store",
      ctaSecondary: "Shiko si funksionon",
    },
    howItWorks: {
      tag: "Rrjedha",
      title: "Nga ideja te fatura e ndarë — në tre hapa.",
      step1: {
        title: "Shto klientin",
        desc: "Shkruaj manualisht ose ngjit të dhënat — AI i plotëson emrin, adresën dhe kontaktin automatikisht.",
      },
      step2: {
        title: "Shto artikujt",
        desc: "Rreshta artikujsh, zbritje, shënime dhe numra automatikë si INV-JUL-001.",
      },
      step3: {
        title: "Parashiko & ndaje PDF-në",
        desc: "Parapamje e pastër PDF, shkarko ose ndaj drejtpërdrejt me klientin.",
      }
    },
    features: {
      tag: "Veçoritë",
      title: "Ndërtuar për ritmin e një studioje moderne.",
      f1: { title: "Plotësim me AI", desc: "Ngjit një email ose kontratë — AI nxjerr klientin, artikujt dhe totalet." },
      f2: { title: "Shqip & Anglisht", desc: "Ndryshim gjuhe me një prekje. Fatura mbetet gjithmonë profesionale." },
      f3: { title: "Ndarje PDF", desc: "PDF me hierarki tipografike të pastër, i gatshëm për email, WhatsApp ose printim." },
      f4: { title: "Profil kompanie", desc: "Nxirret automatikisht nga një faturë ekzistuese — logoja dhe të dhënat vetëm një herë." },
      f5: { title: "Numërim mujor", desc: "Numra fature konsistentë si INV-JUL-001, të organizuar sipas muajit." },
      f6: { title: "Zbritje & shënime", desc: "Zbritje për artikull ose total, plus shënime private për ju dhe klientin." },
    },
    audience: {
      tag: "Për kë është",
      title: "Për njerëzit që faturojnë vetë punën e tyre.",
      a1: { title: "Freelancer", desc: "Dizajnerë, fotografë, konsulentë — fatura sa hap e mbyll sytë." },
      a2: { title: "Butik & studio", desc: "Nga koleksione të vogla te porosi private, faturimi mbetet elegant." },
      a3: { title: "Biznese të vogla", desc: "Numërim mujor, PDF për kontabilistin, gjithçka në xhep." },
    },
    ctaSection: {
      title: "Faturoni si një studio, jo si një spreadsheet.",
      subtitle: "Faturimi është falas për tu provuar në TestFlight.",
      btn1: "Merr në TestFlight",
      btn2: "Shkarko në App Store",
    },
    footer: {
      tagline: "Fatura që duken si punë e mirëmenduar.",
      privacy: "Politika e privatësisë",
      contact: "Kontakti",
      copyright: "© 2026 · Ndërtuar me kujdes nga Tretek.",
    }
  },
  en: {
    nav: {
      howItWorks: "How it works",
      features: "Features",
      audience: "Who it's for",
      getApp: "Get the app",
    },
    hero: {
      badge: "iOS · TestFlight & App Store",
      title: "Faturimi",
      subtitle: "Professional invoices, straight from your phone.",
      description: "Create, share and manage elegant invoices in seconds — designed for fashion studios, freelancers and small businesses.",
      ctaPrimary: "Download on the App Store",
      ctaSecondary: "See how it works",
    },
    howItWorks: {
      tag: "Workflow",
      title: "From idea to shared invoice — in three steps.",
      step1: {
        title: "Add client",
        desc: "Type manually or paste details — AI fills name, address and contact automatically.",
      },
      step2: {
        title: "Add items",
        desc: "Line items, discounts, notes and automatic numbers like INV-JUL-001.",
      },
      step3: {
        title: "Preview & share PDF",
        desc: "Clean PDF preview, download or share directly with the client.",
      }
    },
    features: {
      tag: "Features",
      title: "Built for the pace of a modern studio.",
      f1: { title: "AI Fill", desc: "Paste an email or contract — AI extracts client, items and totals." },
      f2: { title: "Bilingual SQ/EN", desc: "Switch language with one tap. Invoices stay professional." },
      f3: { title: "PDF Sharing", desc: "PDFs with clean typographic hierarchy, ready for email or WhatsApp." },
      f4: { title: "Company Profile", desc: "Extracted automatically from an existing invoice — logo and details once." },
      f5: { title: "Monthly Numbering", desc: "Consistent invoice numbers like INV-JUL-001, organized by month." },
      f6: { title: "Discounts & Notes", desc: "Itemized or total discounts, plus private notes for you and client." },
    },
    audience: {
      tag: "Who it's for",
      title: "For people who bill their own work.",
      a1: { title: "Freelancers", desc: "Designers, photographers, consultants — invoices in a heartbeat." },
      a2: { title: "Boutiques & Studios", desc: "From small collections to private orders, billing stays elegant." },
      a3: { title: "Small Businesses", desc: "Monthly numbering, PDF for accountant, everything in your pocket." },
    },
    ctaSection: {
      title: "Invoice like a studio, not like a spreadsheet.",
      subtitle: "Faturimi is free to try on TestFlight.",
      btn1: "Get on TestFlight",
      btn2: "Download on the App Store",
    },
    footer: {
      tagline: "Invoices that look like thoughtful work.",
      privacy: "Privacy Policy",
      contact: "Contact",
      copyright: "© 2026 · Built with care by Tretek.",
    }
  }
}

function App() {
  const [lang, setLang] = useState<'sq' | 'en'>('sq')
  const t = translations[lang]

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 }
  }

  return (
    <div className="min-h-screen text-brand-ink bg-brand-bg font-sans selection:bg-brand-accent selection:text-brand-ink">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10 md:py-8">
          <a href="#top" className="flex items-center gap-2 group">
            <motion.span 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block h-3 w-3 rounded-full bg-brand-accent shadow-[0_0_10px_rgba(232,163,61,0.5)]"
            />
            <span className="font-display text-xl font-bold tracking-tight text-brand-ink">Faturimi</span>
          </a>
          
          <div className="hidden items-center gap-10 md:flex">
            <a href="#how" className="text-sm font-medium text-brand-ink/70 transition hover:text-brand">
              {t.nav.howItWorks}
            </a>
            <a href="#features" className="text-sm font-medium text-brand-ink/70 transition hover:text-brand">
              {t.nav.features}
            </a>
            <a href="#audience" className="text-sm font-medium text-brand-ink/70 transition hover:text-brand">
              {t.nav.audience}
            </a>
          </div>

          <div className="flex items-center gap-4">
            <div role="group" aria-label="Language selection" className="flex items-center overflow-hidden rounded-full border border-brand-ink/10 bg-white/40 p-1 backdrop-blur-md">
              <button 
                onClick={() => setLang('sq')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold tracking-wider transition-all rounded-full",
                  lang === 'sq' ? "bg-brand-ink text-white shadow-sm" : "text-brand-ink/60 hover:text-brand-ink"
                )}
              >
                SQ
              </button>
              <button 
                onClick={() => setLang('en')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold tracking-wider transition-all rounded-full",
                  lang === 'en' ? "bg-brand-ink text-white shadow-sm" : "text-brand-ink/60 hover:text-brand-ink"
                )}
              >
                EN
              </button>
            </div>
            <a href="#" className="hidden md:inline-flex items-center rounded-full bg-brand-ink px-5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark hover:scale-105 active:scale-95">
              {t.nav.getApp}
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section id="top" className="relative overflow-hidden hero-atmosphere pt-20">
        <div className="pointer-events-none absolute inset-0 soft-grid opacity-30" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pt-24 pb-20 md:grid-cols-12 md:gap-16 md:px-10 md:pt-36 md:pb-32">
          <div className="md:col-span-7">
            <motion.p 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand"
            >
              {t.hero.badge}
            </motion.p>
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.8 }}
              className="mt-6 font-display text-[clamp(2.5rem,8vw,6rem)] font-medium leading-[0.95] tracking-[-0.04em]"
            >
              <span className="block">{t.hero.title}</span>
              <span className="block italic text-brand-dark/90 font-light mt-2">{t.hero.subtitle}</span>
            </motion.h1>
            <motion.div 
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="mt-8 h-[2px] w-24 bg-brand-accent origin-left"
            />
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 1 }}
              className="mt-8 max-w-xl text-xl leading-relaxed text-brand-ink/80"
            >
              {t.hero.description}
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mt-12 flex flex-wrap items-center gap-4"
            >
              <a href="#" className="group inline-flex items-center gap-3 rounded-full bg-brand-ink px-8 py-4 text-sm font-bold text-white shadow-xl shadow-brand-dark/20 transition-all hover:bg-brand-dark hover:-translate-y-1">
                <Smartphone className="h-5 w-5" />
                <span>{t.hero.ctaPrimary}</span>
              </a>
              <a href="#how" className="inline-flex items-center gap-2 rounded-full border border-brand-ink/10 bg-white/40 px-8 py-4 text-sm font-bold text-brand-ink backdrop-blur-md transition-all hover:bg-white hover:border-brand-accent/30">
                {t.hero.ctaSecondary}
                <ChevronRight className="h-4 w-4" />
              </a>
            </motion.div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, rotate: 2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 1 }}
            className="md:col-span-5 relative"
          >
            <div className="absolute -inset-12 -z-10 rounded-full bg-gradient-to-br from-brand-accent/25 via-brand/15 to-transparent blur-3xl" />
            <div className="animate-float-slow overflow-hidden rounded-[2rem] ring-1 ring-brand-ink/10 shadow-2xl shadow-brand-dark/20">
              <img
                src={heroPhone}
                alt="Faturimi në iPhone duke shfaqur faturën INV-JUL-001"
                width={1024}
                height={900}
                className="h-auto w-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how" className="relative section-warm py-24 md:py-36">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div {...fadeIn} className="flex flex-col gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-accent">{t.howItWorks.tag}</span>
            <h2 className="max-w-2xl font-display text-4xl leading-[1.05] md:text-6xl font-medium tracking-tight">
              {t.howItWorks.title}
            </h2>
          </motion.div>

          <div className="mt-20 grid gap-12 md:grid-cols-3 md:gap-8">
            {[t.howItWorks.step1, t.howItWorks.step2, t.howItWorks.step3].map((step, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group relative"
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-display text-6xl italic font-light text-brand-accent/40 group-hover:text-brand-accent transition-colors duration-500">0{idx + 1}</span>
                  <div className="h-[1px] flex-1 bg-brand-ink/10 group-hover:bg-brand-accent transition-all duration-700" />
                </div>
                <h3 className="mt-8 font-display text-2xl font-semibold">{step.title}</h3>
                <p className="mt-4 text-brand-ink/70 leading-relaxed">{step.desc}</p>
                {idx < 2 && (
                  <div className="absolute right-[-2rem] top-8 hidden text-brand-ink/5 md:block">
                    <ChevronRight className="h-12 w-12" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-24 md:py-36 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="grid gap-16 md:grid-cols-12 md:items-start">
            <motion.div {...fadeIn} className="md:col-span-5 md:sticky md:top-36">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">{t.features.tag}</span>
              <h2 className="mt-6 font-display text-4xl leading-[1.05] md:text-6xl font-medium tracking-tight">
                {t.features.title}
              </h2>
              <div className="mt-10 h-[2px] w-16 bg-brand-accent" />
              
              <div className="mt-16 relative aspect-square w-full max-w-[300px] hidden md:block">
                <div className="absolute inset-0 border border-brand-accent/20 rounded-full animate-[spin_20s_linear_infinite]" />
                <div className="absolute inset-8 border border-brand/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="relative"
                  >
                    <Cpu className="h-12 w-12 text-brand-accent" />
                  </motion.div>
                </div>
              </div>
            </motion.div>

            <div className="grid gap-x-12 gap-y-16 md:col-span-7 md:grid-cols-2">
              {[
                { ...t.features.f1, icon: Cpu },
                { ...t.features.f2, icon: Languages },
                { ...t.features.f3, icon: FileText },
                { ...t.features.f4, icon: ShieldCheck },
                { ...t.features.f5, icon: Layers },
                { ...t.features.f6, icon: CheckCircle2 }
              ].map((feature, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white transition-all duration-300">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <span className="h-[1px] w-8 bg-brand-ink/10 group-hover:w-16 group-hover:bg-brand-accent transition-all duration-500" />
                  </div>
                  <h3 className="mt-6 font-display text-xl font-bold">{feature.title}</h3>
                  <p className="mt-3 text-brand-ink/70 leading-relaxed text-sm">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Audience Section */}
      <section id="audience" className="section-warm py-24 md:py-36">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div {...fadeIn}>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-accent">{t.audience.tag}</span>
            <h2 className="mt-6 max-w-2xl font-display text-4xl leading-[1.05] md:text-6xl font-medium tracking-tight">
              {t.audience.title}
            </h2>
          </motion.div>

          <div className="mt-20 grid gap-8 md:grid-cols-3">
            {[t.audience.a1, t.audience.a2, t.audience.a3].map((item, idx) => (
              <motion.article 
                key={idx}
                whileHover={{ y: -8 }}
                className="group relative overflow-hidden rounded-[2rem] border border-brand-ink/5 bg-white/80 p-10 backdrop-blur-sm transition-all shadow-sm hover:shadow-2xl hover:shadow-brand-dark/10 hover:border-brand-accent/30"
              >
                <div className="absolute right-8 top-8 h-2 w-2 rounded-full bg-brand-accent/40 group-hover:scale-[3] group-hover:bg-brand-accent transition-all duration-500" />
                <h3 className="font-display text-2xl font-bold">{item.title}</h3>
                <p className="mt-6 text-brand-ink/70 leading-relaxed">{item.desc}</p>
                <div className="mt-8 flex justify-end">
                  <div className="h-10 w-10 rounded-full bg-brand-bg flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-colors duration-300">
                    <MousePointer2 className="h-4 w-4" />
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="section-deep relative py-24 md:py-40 overflow-hidden text-white">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-accent/20 blur-[100px]" />
          <div className="absolute -left-24 -bottom-24 h-96 w-96 rounded-full bg-brand/30 blur-[100px]" />
        </div>
        
        <div className="relative mx-auto max-w-5xl px-6 text-center md:px-10">
          <motion.h2 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl font-display text-4xl leading-[1.05] md:text-7xl font-medium tracking-tight"
          >
            {t.ctaSection.title}
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-8 max-w-xl text-lg text-white/70"
          >
            {t.ctaSection.subtitle}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-4"
          >
            <a href="#" className="inline-flex items-center gap-3 rounded-full bg-brand-accent px-10 py-5 text-sm font-bold text-brand-ink transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/20">
              <Download className="h-5 w-5" />
              {t.ctaSection.btn1}
            </a>
            <a href="#" className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-10 py-5 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/20">
              <Smartphone className="h-5 w-5" />
              {t.ctaSection.btn2}
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-brand-ink/5 bg-brand-bg py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-brand-accent" />
                <span className="font-display text-xl font-bold">Faturimi</span>
              </div>
              <p className="max-w-xs text-sm text-brand-ink/60 leading-relaxed italic">
                {t.footer.tagline}
              </p>
            </div>
            
            <div className="flex flex-col gap-6 text-sm md:items-end">
              <div className="flex flex-wrap gap-x-8 gap-y-4 md:justify-end">
                <a href="https://tretek.github.io/nextinvoice/privacy-policy.html" className="font-medium text-brand-ink/60 transition hover:text-brand" target="_blank" rel="noreferrer">
                  {t.footer.privacy}
                </a>
                <a href="mailto:lirim.sylejmani@tretek.io" className="flex items-center gap-2 font-medium text-brand-ink/60 transition hover:text-brand">
                  <Mail className="h-4 w-4" />
                  {t.footer.contact}
                </a>
              </div>
              <p className="text-xs text-brand-ink/40 font-medium tracking-wide">
                {t.footer.copyright}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
