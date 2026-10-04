import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  Flame,
  FolderKanban,
  LayoutDashboard,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link } from "../router/Router";
import "./LandingPage.css";

export function LandingPage() {
  return (
    <div className="landing-page">
      {/* Top Header */}
      <header className="landing-header" role="banner">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            <div className="landing-brand-logo" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <span className="landing-brand-text">TrackUp</span>
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
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section" aria-labelledby="hero-heading">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>The Personal Life OS</span>
          </div>

          <h1 id="hero-heading" className="hero-headline">
            Track Your Life.
            <br />
            Build a Better You.
          </h1>

          <p className="hero-subhead">
            A unified personal operating system designed to turn daily actions into long-term momentum. Tasks, projects, habits, and focus — all in one calm command center.
          </p>

          <div className="hero-actions">
            <Link to="/signup" className="btn-hero-primary">
              <span>Start Your Workspace</span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/dashboard" className="btn-hero-secondary">
              <LayoutDashboard size={18} />
              <span>Explore Dashboard Preview</span>
            </Link>
          </div>
        </div>

        {/* Product Mockup Preview (Inspired by Reference 1 & 2) */}
        <div className="hero-mockup-wrapper" aria-hidden="true">
          <div className="hero-mockup">
            <div className="mockup-bar">
              <div className="window-dots">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>
              <div className="mockup-address">trackup.internal/dashboard</div>
            </div>

            <div className="mockup-body">
              {/* Stat Cards */}
              <div className="mockup-grid">
                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Tasks Today</span>
                    <div className="stat-icon-wrap stat-icon-indigo">
                      <CheckCircle2 size={16} />
                    </div>
                  </div>
                  <div className="stat-value">4</div>
                  <span className="stat-label">1 of 4 completed</span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Daily Progress</span>
                    <div className="stat-icon-wrap stat-icon-emerald">
                      <BarChart3 size={16} />
                    </div>
                  </div>
                  <div className="stat-value">25%</div>
                  <span className="stat-label">On track for today</span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Remaining</span>
                    <div className="stat-icon-wrap stat-icon-amber">
                      <Clock size={16} />
                    </div>
                  </div>
                  <div className="stat-value">3</div>
                  <span className="stat-label">To do today</span>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Overdue</span>
                    <div className="stat-icon-wrap stat-icon-crimson">
                      <Zap size={16} />
                    </div>
                  </div>
                  <div className="stat-value">1</div>
                  <span className="stat-label" style={{ color: "var(--color-danger)" }}>
                    Needs attention
                  </span>
                </div>
              </div>

              {/* Task Preview Panels */}
              <div className="mockup-panels">
                <div className="mockup-panel">
                  <div className="panel-header">
                    <span className="panel-title">Today's Tasks</span>
                    <span className="panel-link">View all →</span>
                  </div>

                  <div className="task-preview-list">
                    <div className="task-preview-item">
                      <div className="task-preview-checkbox" />
                      <span className="task-title">Design new landing page</span>
                      <span className="badge-priority badge-high">High</span>
                    </div>

                    <div className="task-preview-item">
                      <div className="task-preview-checkbox" />
                      <span className="task-title">Go for a 30 min run</span>
                      <span className="badge-priority badge-medium">Medium</span>
                    </div>

                    <div className="task-preview-item">
                      <div className="task-preview-checkbox checked">
                        <CheckCircle2 size={12} />
                      </div>
                      <span className="task-title done">Read 20 pages</span>
                      <span className="badge-priority badge-low">Low</span>
                    </div>

                    <div className="task-preview-item">
                      <div className="task-preview-checkbox" />
                      <span className="task-title">Update project roadmap</span>
                      <span className="badge-priority badge-high">High</span>
                    </div>
                  </div>
                </div>

                <div className="mockup-panel">
                  <div className="panel-header">
                    <span className="panel-title">Upcoming</span>
                    <span className="panel-link">Calendar →</span>
                  </div>

                  <div className="task-preview-list">
                    <div className="task-preview-item">
                      <div className="task-preview-checkbox" />
                      <span className="task-title">Plan weekly meals</span>
                      <span className="stat-label">Tomorrow</span>
                    </div>

                    <div className="task-preview-item">
                      <div className="task-preview-checkbox" />
                      <span className="task-title">Review Q1 goals</span>
                      <span className="stat-label">Apr 26</span>
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
            <div className="value-icon">
              <CheckSquare size={22} />
            </div>
            <h3 className="value-card-title">Organize Your Day</h3>
            <p className="value-card-desc">
              Capture tasks in seconds. Prioritize what truly matters today, plan upcoming deadlines, and keep an uncluttered inbox.
            </p>
          </div>

          <div className="value-card">
            <div className="value-icon">
              <FolderKanban size={22} />
            </div>
            <h3 className="value-card-title">Connect Projects & Execution</h3>
            <p className="value-card-desc">
              Never let tasks float in a vacuum. Associate actions with meaningful projects and track milestone velocity seamlessly.
            </p>
          </div>

          <div className="value-card">
            <div className="value-icon">
              <Flame size={22} />
            </div>
            <h3 className="value-card-title">Build Atomic Habits</h3>
            <p className="value-card-desc">
              Transform daily routines into permanent habits. Check off daily streaks and monitor consistency over weeks and months.
            </p>
          </div>

          <div className="value-card">
            <div className="value-icon">
              <Compass size={22} />
            </div>
            <h3 className="value-card-title">One Source of Truth</h3>
            <p className="value-card-desc">
              Your tasks, routines, deadlines, and progress live in a unified Life OS. No disconnected spreadsheets or fragmented apps.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Preview Section */}
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
            <div className="feature-item">
              <span className="feature-tag">Foundation</span>
              <h3 className="feature-name">Tasks & Planning</h3>
              <p className="feature-summary">
                Fast capture, priority tiers (Low, Medium, High), due dates, and virtual views for Today, Upcoming, and Overdue.
              </p>
              <Link to="/tasks" className="feature-link">
                <span>View Tasks module</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="feature-item">
              <span className="feature-tag">Execution</span>
              <h3 className="feature-name">Projects & Roadmaps</h3>
              <p className="feature-summary">
                Structured workspaces to group tasks, track completion percentages, and manage multi-week initiatives.
              </p>
              <Link to="/projects" className="feature-link">
                <span>View Projects module</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="feature-item">
              <span className="feature-tag">Strategy</span>
              <h3 className="feature-name">Goals & Vision</h3>
              <p className="feature-summary">
                Define quarterly and annual milestones. Bridge high-level aspirations directly into day-to-day execution.
              </p>
              <Link to="/goals" className="feature-link">
                <span>View Goals module</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="feature-item">
              <span className="feature-tag">Consistency</span>
              <h3 className="feature-name">Habit Tracking</h3>
              <p className="feature-summary">
                Frictionless daily check-ins, visual streaks, and habit stacking designed to build lasting momentum.
              </p>
              <Link to="/habits" className="feature-link">
                <span>View Habits module</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="feature-item">
              <span className="feature-tag">Time</span>
              <h3 className="feature-name">Calendar & Timelines</h3>
              <p className="feature-summary">
                Agenda feeds, daily focus blocks, and upcoming deadline views so your calendar mirrors your priorities.
              </p>
              <Link to="/calendar" className="feature-link">
                <span>View Calendar module</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="feature-item">
              <span className="feature-tag">Intelligence</span>
              <h3 className="feature-name">Progress Insights</h3>
              <p className="feature-summary">
                Actionable weekly reviews, completion analytics, and focus metrics without noise or vanity charts.
              </p>
              <Link to="/dashboard" className="feature-link">
                <span>View Dashboard</span>
                <ArrowRight size={14} />
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
            <div className="step-num">01</div>
            <h3 className="step-title">Plan</h3>
            <p className="step-desc">
              Organize your day in under 3 minutes. Review what is due today and commit to top priorities.
            </p>
          </div>

          <div className="workflow-step">
            <div className="step-num">02</div>
            <h3 className="step-title">Execute</h3>
            <p className="step-desc">
              Work from a clean, focused view. Check off tasks without jumping between disconnected tools.
            </p>
          </div>

          <div className="workflow-step">
            <div className="step-num">03</div>
            <h3 className="step-title">Track</h3>
            <p className="step-desc">
              Log habit check-ins and project updates effortlessly as you make tangible progress.
            </p>
          </div>

          <div className="workflow-step">
            <div className="step-num">04</div>
            <h3 className="step-title">Improve</h3>
            <p className="step-desc">
              Gain visibility into what went well, adjust your trajectory, and build compounded momentum.
            </p>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="cta-section" aria-labelledby="cta-heading">
        <div className="cta-box">
          <h2 id="cta-heading" className="cta-title">
            Start building your personal Life OS today.
          </h2>
          <p className="cta-desc">
            Take control of your focus, habits, and tasks with a tool built for intentional clarity.
          </p>
          <div className="hero-actions" style={{ marginBottom: 0 }}>
            <Link to="/signup" className="btn-hero-primary">
              <span>Create Your Free Account</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Public Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="footer-inner">
          <div>
            <strong>TrackUp Life OS</strong> — Track your life. Build a better you.
          </div>
          <div className="footer-links">
            <Link to="/dashboard" className="footer-link">
              Dashboard
            </Link>
            <Link to="/tasks" className="footer-link">
              Tasks
            </Link>
            <Link to="/login" className="footer-link">
              Sign In
            </Link>
            <Link to="/signup" className="footer-link">
              Sign Up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
