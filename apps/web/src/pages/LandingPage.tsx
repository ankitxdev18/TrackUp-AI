import { useState, useEffect } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  Flame,
  FolderKanban,
  LayoutDashboard,
  Layers,
  Menu,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Link } from "../router/Router";
import { BrandIcon } from "../components/BrandIcon";
import "./LandingPage.css";

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="landing-page">
      {/* Background Ambient Atmosphere */}
      <div className="landing-ambient-canvas" aria-hidden="true">
        <div className="ambient-glow ambient-glow-primary" />
        <div className="ambient-glow ambient-glow-secondary" />
        <div className="ambient-glow ambient-glow-mockup" />
        <div className="ambient-grid-overlay" />
      </div>

      {/* Top Floating Header */}
      <div className={`landing-header-wrapper ${isScrolled ? "is-scrolled" : ""}`}>
        <header className="landing-header" role="banner">
          <div className="landing-header-inner">
            <Link
              to="/"
              className="landing-brand"
              aria-label="TrackUp Home"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="landing-brand-logo" aria-hidden="true">
                <BrandIcon size={18} />
              </div>
              <div className="landing-brand-title-wrap">
                <span className="landing-brand-text">TrackUp</span>
                <span className="landing-brand-tag">Life OS</span>
              </div>
            </Link>

            <nav className="landing-nav" aria-label="Main Navigation">
              <a href="#pillars" className="landing-nav-link">
                Product
              </a>
              <a href="#features" className="landing-nav-link">
                Features
              </a>
              <a href="#workflow" className="landing-nav-link">
                How It Works
              </a>
            </nav>

            <div className="landing-auth-actions">
              <Link to="/login" className="btn-ghost">
                Sign In
              </Link>
              <Link to="/signup" className="btn-cta-nav">
                <span>Get Started</span>
                <ArrowRight size={14} className="btn-cta-nav-arrow" aria-hidden="true" />
              </Link>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              className="landing-mobile-toggle"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          {/* Mobile Navigation Dropdown */}
          {mobileMenuOpen && (
            <div
              id="landing-mobile-menu"
              className="landing-mobile-menu"
              role="dialog"
              aria-modal="false"
              aria-label="Mobile Navigation"
            >
              <nav className="mobile-nav-links" aria-label="Mobile Navigation Links">
                <a
                  href="#pillars"
                  className="mobile-nav-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Product
                </a>
                <a
                  href="#features"
                  className="mobile-nav-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Features
                </a>
                <a
                  href="#workflow"
                  className="mobile-nav-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How It Works
                </a>
              </nav>
              <div className="mobile-auth-divider" />
              <div className="mobile-auth-actions">
                <Link
                  to="/login"
                  className="btn-mobile-secondary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="btn-mobile-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Get Started</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </header>
      </div>

      {/* Main Content */}
      <main id="main-content">
        {/* Hero Section */}
        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="hero-content">
            <div className="hero-badge" role="status">
              <Sparkles size={13} className="hero-badge-icon" aria-hidden="true" />
              <span className="hero-badge-text">The Personal Life OS</span>
              <span className="hero-badge-pill" aria-hidden="true">v0.9</span>
            </div>

            <h1 id="hero-heading" className="hero-headline">
              Track Your Life.
              <br />
              <span className="hero-headline-highlight">Build a Better You.</span>
            </h1>

            <p className="hero-subhead">
              Plan your days, manage tasks and projects, track goals and habits, and understand your progress — all in one calm command center.
            </p>

            <div className="hero-actions">
              <Link to="/signup" className="btn-hero-primary">
                <span>Start Your Workspace</span>
                <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
              </Link>
              <Link to="/dashboard" className="btn-hero-secondary">
                <LayoutDashboard size={17} className="btn-secondary-icon" aria-hidden="true" />
                <span>Explore Dashboard Preview</span>
              </Link>
            </div>

            <div className="hero-trust-row" aria-hidden="true">
              <span className="hero-trust-item">
                <ShieldCheck size={14} /> Private & Local-First Feel
              </span>
              <span className="hero-trust-separator">•</span>
              <span className="hero-trust-item">
                <Zap size={14} /> High-Density Design
              </span>
              <span className="hero-trust-separator">•</span>
              <span className="hero-trust-item">
                <Activity size={14} /> Zero Clutter Workflow
              </span>
            </div>
          </div>

          {/* Product Mockup Preview */}
          <div className="hero-mockup-wrapper" aria-label="Interactive Product Preview">
            <div className="hero-mockup">
              {/* Browser Window Bar */}
              <div className="mockup-bar">
                <div className="window-dots" aria-hidden="true">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <div className="mockup-address" aria-hidden="true">
                  <span className="address-lock">🔒</span>
                  <span>trackup.internal/dashboard</span>
                </div>
                <div className="mockup-status-indicator" aria-hidden="true">
                  <span className="status-dot" />
                  <span className="status-label">Synchronized</span>
                </div>
              </div>

              {/* Mockup Content Body */}
              <div className="mockup-body">
                {/* Metric Summary Cards */}
                <div className="mockup-grid">
                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Tasks Today</span>
                      <div className="stat-icon-wrap stat-icon-indigo" aria-hidden="true">
                        <CheckCircle2 size={15} />
                      </div>
                    </div>
                    <div className="stat-value-row">
                      <span className="stat-value">4</span>
                      <span className="stat-trend stat-trend-neutral">1 done</span>
                    </div>
                    <span className="stat-subtext">1 of 4 completed</span>
                    <div className="stat-bar-track" aria-hidden="true">
                      <div className="stat-bar-fill stat-bar-indigo" style={{ width: "25%" }} />
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Daily Progress</span>
                      <div className="stat-icon-wrap stat-icon-emerald" aria-hidden="true">
                        <BarChart3 size={15} />
                      </div>
                    </div>
                    <div className="stat-value-row">
                      <span className="stat-value">25%</span>
                      <span className="stat-trend stat-trend-positive">+12% vs avg</span>
                    </div>
                    <span className="stat-subtext">On track for today</span>
                    <div className="stat-bar-track" aria-hidden="true">
                      <div className="stat-bar-fill stat-bar-emerald" style={{ width: "25%" }} />
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Remaining</span>
                      <div className="stat-icon-wrap stat-icon-amber" aria-hidden="true">
                        <Clock size={15} />
                      </div>
                    </div>
                    <div className="stat-value-row">
                      <span className="stat-value">3</span>
                      <span className="stat-trend stat-trend-amber">Due today</span>
                    </div>
                    <span className="stat-subtext">To do today</span>
                    <div className="stat-bar-track" aria-hidden="true">
                      <div className="stat-bar-fill stat-bar-amber" style={{ width: "75%" }} />
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Overdue</span>
                      <div className="stat-icon-wrap stat-icon-crimson" aria-hidden="true">
                        <Zap size={15} />
                      </div>
                    </div>
                    <div className="stat-value-row">
                      <span className="stat-value">1</span>
                      <span className="stat-trend stat-trend-danger">Action required</span>
                    </div>
                    <span className="stat-subtext stat-alert">Needs attention</span>
                    <div className="stat-bar-track" aria-hidden="true">
                      <div className="stat-bar-fill stat-bar-danger" style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>

                {/* Dashboard Panels */}
                <div className="mockup-panels">
                  {/* Today's Tasks Panel */}
                  <div className="mockup-panel">
                    <div className="panel-header">
                      <div className="panel-title-group">
                        <span className="panel-title">Today's Tasks</span>
                        <span className="panel-counter">4 items</span>
                      </div>
                      <Link to="/tasks" className="panel-link" tabIndex={-1}>
                        <span>View all</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>

                    <div className="task-preview-list">
                      <div className="task-preview-item">
                        <div className="task-preview-checkbox" aria-hidden="true" />
                        <div className="task-title-group">
                          <span className="task-title">Design new landing page</span>
                          <span className="task-context-tag">Life OS Launch</span>
                        </div>
                        <span className="badge-priority badge-high">High</span>
                      </div>

                      <div className="task-preview-item">
                        <div className="task-preview-checkbox" aria-hidden="true" />
                        <div className="task-title-group">
                          <span className="task-title">Go for a 30 min run</span>
                          <span className="task-context-tag">Health & Fitness</span>
                        </div>
                        <span className="badge-priority badge-medium">Medium</span>
                      </div>

                      <div className="task-preview-item is-done">
                        <div className="task-preview-checkbox checked" aria-hidden="true">
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <div className="task-title-group">
                          <span className="task-title done">Read 20 pages</span>
                          <span className="task-context-tag">Habits</span>
                        </div>
                        <span className="badge-priority badge-low">Low</span>
                      </div>

                      <div className="task-preview-item">
                        <div className="task-preview-checkbox" aria-hidden="true" />
                        <div className="task-title-group">
                          <span className="task-title">Update project roadmap</span>
                          <span className="task-context-tag">Product Architecture</span>
                        </div>
                        <span className="badge-priority badge-high">High</span>
                      </div>
                    </div>
                  </div>

                  {/* Upcoming & Strategic Alignment Panel */}
                  <div className="mockup-panel mockup-panel-side">
                    <div className="panel-header">
                      <div className="panel-title-group">
                        <span className="panel-title">Upcoming</span>
                        <span className="panel-counter">Next 7 days</span>
                      </div>
                      <Link to="/calendar" className="panel-link" tabIndex={-1}>
                        <span>Calendar</span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>

                    <div className="task-preview-list">
                      <div className="task-preview-item compact">
                        <div className="task-preview-checkbox" aria-hidden="true" />
                        <span className="task-title">Plan weekly meals</span>
                        <span className="date-tag">Tomorrow</span>
                      </div>

                      <div className="task-preview-item compact">
                        <div className="task-preview-checkbox" aria-hidden="true" />
                        <span className="task-title">Review Q1 goals</span>
                        <span className="date-tag">Apr 26</span>
                      </div>
                    </div>

                    {/* Integrated Goal & Habit Indicator */}
                    <div className="mockup-side-widget" aria-hidden="true">
                      <div className="widget-header">
                        <div className="widget-label-wrap">
                          <Target size={13} className="widget-icon" />
                          <span className="widget-title">Active Milestone</span>
                        </div>
                        <span className="widget-percent">75%</span>
                      </div>
                      <div className="widget-name">Launch TrackUp v1.0</div>
                      <div className="stat-bar-track">
                        <div className="stat-bar-fill stat-bar-indigo" style={{ width: "75%" }} />
                      </div>
                      <div className="widget-footer">
                        <span className="streak-badge">
                          <Flame size={12} /> 14-day streak active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Value Pillars Section */}
        <section id="pillars" className="value-section" aria-labelledby="pillars-heading">
          <div className="section-header">
            <span className="section-pill">Why TrackUp</span>
            <h2 id="pillars-heading" className="section-title">
              Built for focus, clarity, and consistency.
            </h2>
            <p className="section-desc">
              Too many productivity tools become a full-time job. TrackUp is designed to be calm, intentional, and high-density so you spend less time managing software and more time building.
            </p>
          </div>

          <div className="value-grid">
            <div className="value-card">
              <div className="value-icon-box value-icon-indigo" aria-hidden="true">
                <CheckSquare size={22} />
              </div>
              <h3 className="value-card-title">Organize Your Day</h3>
              <p className="value-card-desc">
                Capture tasks in seconds. Prioritize what truly matters today, plan upcoming deadlines, and keep an uncluttered inbox.
              </p>
              <div className="card-ambient-accent" aria-hidden="true" />
            </div>

            <div className="value-card">
              <div className="value-icon-box value-icon-lavender" aria-hidden="true">
                <FolderKanban size={22} />
              </div>
              <h3 className="value-card-title">Connect Projects & Execution</h3>
              <p className="value-card-desc">
                Never let tasks float in a vacuum. Associate actions with meaningful projects and track milestone velocity seamlessly.
              </p>
              <div className="card-ambient-accent" aria-hidden="true" />
            </div>

            <div className="value-card">
              <div className="value-icon-box value-icon-amber" aria-hidden="true">
                <Flame size={22} />
              </div>
              <h3 className="value-card-title">Build Atomic Habits</h3>
              <p className="value-card-desc">
                Transform daily routines into permanent habits. Check off daily streaks and monitor consistency over weeks and months.
              </p>
              <div className="card-ambient-accent" aria-hidden="true" />
            </div>

            <div className="value-card">
              <div className="value-icon-box value-icon-emerald" aria-hidden="true">
                <Compass size={22} />
              </div>
              <h3 className="value-card-title">One Source of Truth</h3>
              <p className="value-card-desc">
                Your tasks, routines, deadlines, and progress live in a unified Life OS. No disconnected spreadsheets or fragmented apps.
              </p>
              <div className="card-ambient-accent" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* Feature Storytelling Showcase */}
        <section id="features" className="features-section" aria-labelledby="features-heading">
          <div className="features-inner">
            <div className="section-header">
              <span className="section-pill">Feature System</span>
              <h2 id="features-heading" className="section-title">
                Every dimension of personal growth, unified.
              </h2>
              <p className="section-desc">
                Preview the modular ecosystem coming to TrackUp as we build out each capability phase by phase.
              </p>
            </div>

            <div className="features-grid">
              {/* Feature 1: Tasks */}
              <div className="feature-item feature-item-primary">
                <div className="feature-header-row">
                  <span className="feature-tag">Foundation</span>
                  <span className="feature-status-badge">Available Now</span>
                </div>
                <h3 className="feature-name">Tasks & Planning</h3>
                <p className="feature-summary">
                  Fast capture, priority tiers (Low, Medium, High), due dates, and virtual views for Today, Upcoming, and Overdue.
                </p>
                {/* Visual Storytelling Mini UI */}
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-task-pill">
                    <CheckCircle2 size={13} className="text-emerald" />
                    <span>Deep work: Core architecture</span>
                    <span className="mini-badge-priority high">High</span>
                  </div>
                  <div className="mini-task-pill">
                    <Clock size={13} className="text-muted" />
                    <span>Review daily metrics</span>
                    <span className="mini-badge-priority medium">Medium</span>
                  </div>
                </div>
                <Link to="/tasks" className="feature-link">
                  <span>View Tasks module</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>

              {/* Feature 2: Projects */}
              <div className="feature-item">
                <div className="feature-header-row">
                  <span className="feature-tag">Execution</span>
                  <span className="feature-status-badge">Available Now</span>
                </div>
                <h3 className="feature-name">Projects & Roadmaps</h3>
                <p className="feature-summary">
                  Structured workspaces to group tasks, track completion percentages, and manage multi-week initiatives.
                </p>
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-progress-card">
                    <div className="mini-progress-header">
                      <span>Life OS v1.0 Launch</span>
                      <span className="mini-progress-value">68%</span>
                    </div>
                    <div className="stat-bar-track">
                      <div className="stat-bar-fill stat-bar-indigo" style={{ width: "68%" }} />
                    </div>
                  </div>
                </div>
                <Link to="/projects" className="feature-link">
                  <span>View Projects module</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>

              {/* Feature 3: Goals */}
              <div className="feature-item">
                <div className="feature-header-row">
                  <span className="feature-tag">Strategy</span>
                  <span className="feature-status-badge">Available Now</span>
                </div>
                <h3 className="feature-name">Goals & Vision</h3>
                <p className="feature-summary">
                  Define quarterly and annual milestones. Bridge high-level aspirations directly into day-to-day execution.
                </p>
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-goal-card">
                    <div className="mini-goal-title">
                      <Target size={13} className="text-indigo" />
                      <span>Reach 50km Monthly Run</span>
                    </div>
                    <span className="mini-goal-status">Target: Q4</span>
                  </div>
                </div>
                <Link to="/goals" className="feature-link">
                  <span>View Goals module</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>

              {/* Feature 4: Habits */}
              <div className="feature-item">
                <div className="feature-header-row">
                  <span className="feature-tag">Consistency</span>
                  <span className="feature-status-badge feature-status-next">In Pipeline</span>
                </div>
                <h3 className="feature-name">Habit Tracking</h3>
                <p className="feature-summary">
                  Frictionless daily check-ins, visual streaks, and habit stacking designed to build lasting momentum.
                </p>
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-habit-row">
                    <span className="mini-habit-name">Morning meditation</span>
                    <div className="mini-dots-row">
                      <span className="mini-dot active" />
                      <span className="mini-dot active" />
                      <span className="mini-dot active" />
                      <span className="mini-dot active" />
                      <span className="mini-dot active" />
                      <span className="mini-dot" />
                      <span className="mini-dot" />
                    </div>
                  </div>
                </div>
                <Link to="/habits" className="feature-link">
                  <span>View Habits module</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>

              {/* Feature 5: Calendar */}
              <div className="feature-item">
                <div className="feature-header-row">
                  <span className="feature-tag">Time</span>
                  <span className="feature-status-badge feature-status-next">In Pipeline</span>
                </div>
                <h3 className="feature-name">Calendar & Timelines</h3>
                <p className="feature-summary">
                  Agenda feeds, daily focus blocks, and upcoming deadline views so your calendar mirrors your priorities.
                </p>
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-calendar-block">
                    <div className="mini-time-row">
                      <span className="time-badge">09:00</span>
                      <span className="time-task">Deep Work • Engineering</span>
                    </div>
                    <div className="mini-time-row">
                      <span className="time-badge">14:00</span>
                      <span className="time-task">Review & Roadmap Sync</span>
                    </div>
                  </div>
                </div>
                <Link to="/calendar" className="feature-link">
                  <span>View Calendar module</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>

              {/* Feature 6: Analytics */}
              <div className="feature-item">
                <div className="feature-header-row">
                  <span className="feature-tag">Intelligence</span>
                  <span className="feature-status-badge">Available Now</span>
                </div>
                <h3 className="feature-name">Progress Insights</h3>
                <p className="feature-summary">
                  Actionable weekly reviews, completion analytics, and focus metrics without noise or vanity charts.
                </p>
                <div className="feature-mini-ui" aria-hidden="true">
                  <div className="mini-insights-row">
                    <div className="mini-stat-chunk">
                      <span className="stat-chunk-label">Velocity</span>
                      <span className="stat-chunk-val">+18%</span>
                    </div>
                    <div className="mini-stat-chunk">
                      <span className="stat-chunk-label">Focus Score</span>
                      <span className="stat-chunk-val">92/100</span>
                    </div>
                  </div>
                </div>
                <Link to="/dashboard" className="feature-link">
                  <span>View Dashboard</span>
                  <ArrowRight size={14} className="feature-link-arrow" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="workflow" className="workflow-section" aria-labelledby="workflow-heading">
          <div className="section-header">
            <span className="section-pill">The Operating Loop</span>
            <h2 id="workflow-heading" className="section-title">
              Simple. Systematic. Repeatable.
            </h2>
            <p className="section-desc">
              TrackUp follows a clear four-step cycle to keep you moving forward every single day.
            </p>
          </div>

          <div className="workflow-steps">
            <div className="workflow-step">
              <div className="step-num-wrap">
                <span className="step-num">01</span>
                <span className="step-accent-line" aria-hidden="true" />
              </div>
              <h3 className="step-title">Plan</h3>
              <p className="step-desc">
                Organize your day in under 3 minutes. Review what is due today and commit to top priorities.
              </p>
            </div>

            <div className="workflow-step">
              <div className="step-num-wrap">
                <span className="step-num">02</span>
                <span className="step-accent-line" aria-hidden="true" />
              </div>
              <h3 className="step-title">Execute</h3>
              <p className="step-desc">
                Work from a clean, focused view. Check off tasks without jumping between disconnected tools.
              </p>
            </div>

            <div className="workflow-step">
              <div className="step-num-wrap">
                <span className="step-num">03</span>
                <span className="step-accent-line" aria-hidden="true" />
              </div>
              <h3 className="step-title">Track</h3>
              <p className="step-desc">
                Log habit check-ins and project updates effortlessly as you make tangible progress.
              </p>
            </div>

            <div className="workflow-step">
              <div className="step-num-wrap">
                <span className="step-num">04</span>
                <span className="step-accent-line" aria-hidden="true" />
              </div>
              <h3 className="step-title">Improve</h3>
              <p className="step-desc">
                Gain visibility into what went well, adjust your trajectory, and build compounded momentum.
              </p>
            </div>
          </div>
        </section>

        {/* Final Call to Action */}
        <section className="cta-section" aria-labelledby="cta-heading">
          <div className="cta-glow-backdrop" aria-hidden="true" />
          <div className="cta-box">
            <div className="cta-badge" aria-hidden="true">
              <Layers size={13} />
              <span>Calm Personal Life OS</span>
            </div>

            <h2 id="cta-heading" className="cta-title">
              Start building your personal Life OS today.
            </h2>
            <p className="cta-desc">
              Take control of your focus, habits, and tasks with a tool built for intentional clarity.
            </p>
            <div className="hero-actions" style={{ marginBottom: "var(--space-6)" }}>
              <Link to="/signup" className="btn-hero-primary">
                <span>Create Your Free Account</span>
                <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
              </Link>
            </div>

            <div className="cta-guarantees" aria-hidden="true">
              <span>✓ Instant access</span>
              <span className="separator">•</span>
              <span>✓ No credit card required</span>
              <span className="separator">•</span>
              <span>✓ 100% private workspace</span>
            </div>
          </div>
        </section>
      </main>

      {/* Public Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="footer-brand">
              <div className="landing-brand-logo small" aria-hidden="true">
                <BrandIcon size={14} />
              </div>
              <strong>TrackUp Life OS</strong>
            </div>
            <p className="footer-tagline">
              Track your life. Build a better you. Calm command center for personal growth and execution.
            </p>
          </div>

          <div className="footer-links-group">
            <div className="footer-nav-col">
              <span className="footer-heading">Platform</span>
              <Link to="/dashboard" className="footer-link">
                Dashboard
              </Link>
              <Link to="/tasks" className="footer-link">
                Tasks
              </Link>
              <Link to="/projects" className="footer-link">
                Projects
              </Link>
              <Link to="/goals" className="footer-link">
                Goals
              </Link>
            </div>

            <div className="footer-nav-col">
              <span className="footer-heading">Account</span>
              <Link to="/login" className="footer-link">
                Sign In
              </Link>
              <Link to="/signup" className="footer-link">
                Sign Up
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div className="footer-bottom-inner">
            <span>© {new Date().getFullYear()} TrackUp. Crafted with precision for high-agency individuals.</span>
            <div className="footer-sublinks">
              <span className="badge-system-live">System Status: Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
