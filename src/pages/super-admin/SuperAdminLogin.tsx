import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function SuperAdminLogin() {
  const { user, role, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#0a0e1a" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#c9a84c" }} />
      </div>
    );
  }

  if (user && role === "super_admin") return <Navigate to="/super-admin" replace />;
  if (user && role === "outreach_officer") return <Navigate to="/outreach" replace />;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setDoorOpen(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message);
      setDoorOpen(false);
    }
    setSubmitting(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap');

        .ahq-root {
          min-height: 100vh;
          background: #07090f;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* Marble-like background texture */
        .ahq-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(201,168,76,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 90%, rgba(99,120,180,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 100% 100% at 50% 50%, #0c1020 0%, #07090f 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* Subtle grid lines */
        .ahq-root::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(201,168,76,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201,168,76,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 0;
        }

        .ahq-layout {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 0;
          width: 100%;
          max-width: 1000px;
          min-height: 580px;
          margin: 2rem;
          border-radius: 20px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(201,168,76,0.15),
            0 40px 120px rgba(0,0,0,0.8),
            0 0 80px rgba(201,168,76,0.05);
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(24px)'};
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        /* LEFT — Door scene */
        .ahq-door-panel {
          flex: 0 0 42%;
          background: linear-gradient(160deg, #111827 0%, #0c1020 100%);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 40px 30px;
          border-right: 1px solid rgba(201,168,76,0.12);
        }

        .ahq-door-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 70% at 50% 30%, rgba(201,168,76,0.06) 0%, transparent 70%);
        }

        /* Architectural column detail */
        .ahq-column-left, .ahq-column-right {
          position: absolute;
          top: 0; bottom: 0;
          width: 14px;
          background: linear-gradient(180deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.08) 50%, rgba(201,168,76,0.15) 100%);
        }
        .ahq-column-left { left: 0; border-right: 1px solid rgba(201,168,76,0.2); }
        .ahq-column-right { right: 0; border-left: 1px solid rgba(201,168,76,0.2); }

        /* Floor line */
        .ahq-floor {
          position: absolute;
          bottom: 44px;
          left: 20px; right: 20px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.3), transparent);
        }

        /* Door frame */
        .ahq-door-frame {
          position: relative;
          width: 160px;
          height: 240px;
          z-index: 2;
        }

        .ahq-door-arch {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 50px;
          border: 2px solid rgba(201,168,76,0.4);
          border-bottom: none;
          border-radius: 80px 80px 0 0;
        }

        .ahq-door-arch-inner {
          position: absolute;
          top: 6px; left: 6px; right: 6px;
          height: 38px;
          border: 1px solid rgba(201,168,76,0.2);
          border-bottom: none;
          border-radius: 60px 60px 0 0;
        }

        .ahq-door-surround {
          position: absolute;
          top: 30px; left: 0; right: 0; bottom: 0;
          border: 2px solid rgba(201,168,76,0.4);
          border-top: none;
          border-radius: 0 0 2px 2px;
        }

        .ahq-door-surround-inner {
          position: absolute;
          top: 6px; left: 6px; right: 6px; bottom: 6px;
          border: 1px solid rgba(201,168,76,0.15);
        }

        /* The actual door (swings open) */
        .ahq-door {
          position: absolute;
          top: 30px; left: 2px; right: 2px; bottom: 2px;
          transform-origin: left center;
          transform: perspective(600px) rotateY(${doorOpen ? '-75deg' : '0deg'});
          transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1);
          background: linear-gradient(135deg, #1a2035 0%, #141928 60%, #1a2035 100%);
          border-radius: 0 0 1px 1px;
          overflow: hidden;
          box-shadow: inset -4px 0 12px rgba(0,0,0,0.5), inset 4px 0 8px rgba(201,168,76,0.05);
        }

        /* Door panels (decorative recessed rectangles) */
        .ahq-door-panel-top, .ahq-door-panel-bottom {
          position: absolute;
          left: 14px; right: 14px;
          border: 1px solid rgba(201,168,76,0.25);
          border-radius: 2px;
          background: rgba(201,168,76,0.03);
        }
        .ahq-door-panel-top { top: 14px; height: 62px; }
        .ahq-door-panel-bottom { top: 90px; height: 100px; }

        /* Door panel inner lines */
        .ahq-door-panel-top::before, .ahq-door-panel-bottom::before {
          content: '';
          position: absolute;
          inset: 4px;
          border: 1px solid rgba(201,168,76,0.12);
          border-radius: 1px;
        }

        /* Keyhole */
        .ahq-keyhole {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .ahq-keyhole-circle {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 1.5px solid rgba(201,168,76,0.6);
          background: rgba(201,168,76,0.08);
          box-shadow: 0 0 6px rgba(201,168,76,0.3);
        }

        .ahq-keyhole-slot {
          width: 4px;
          height: 8px;
          background: rgba(201,168,76,0.4);
          border-radius: 0 0 2px 2px;
          box-shadow: 0 0 4px rgba(201,168,76,0.3);
        }

        /* Light glow visible when door opens */
        .ahq-door-light {
          position: absolute;
          top: 30px; left: 2px;
          width: 30px;
          bottom: 2px;
          background: linear-gradient(90deg, rgba(201,168,76,0.15), transparent);
          opacity: ${doorOpen ? 1 : 0};
          transition: opacity 0.8s ease 0.4s;
          pointer-events: none;
        }

        /* Glow behind door */
        .ahq-door-glow {
          position: absolute;
          top: 28px; left: 4px; right: 4px; bottom: 0;
          background: radial-gradient(ellipse at center, rgba(201,168,76,0.12), transparent 70%);
          opacity: ${doorOpen ? 1 : 0};
          transition: opacity 0.8s ease 0.6s;
          pointer-events: none;
          z-index: -1;
        }

        /* Welcome text above door */
        .ahq-door-label {
          position: absolute;
          top: 28px;
          left: 0; right: 0;
          text-align: center;
        }

        .ahq-door-label-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 11px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.5);
        }

        /* Tagline below door */
        .ahq-door-tagline {
          position: absolute;
          bottom: 56px;
          left: 0; right: 0;
          text-align: center;
        }

        .ahq-door-tagline p {
          font-family: 'Cormorant Garamond', serif;
          font-size: 12px;
          color: rgba(255,255,255,0.25);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 0;
        }

        /* Stars / ambient lights */
        .ahq-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: rgba(201,168,76,0.4);
          border-radius: 50%;
        }

        /* RIGHT — Form panel */
        .ahq-form-panel {
          flex: 1;
          background: linear-gradient(160deg, #0f1523 0%, #0c1018 100%);
          padding: 52px 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
        }

        .ahq-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 40px;
        }

        .ahq-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #c9a84c, #a8883a);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 700;
          color: #07090f;
        }

        .ahq-brand-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          letter-spacing: 0.5px;
        }

        .ahq-brand-name span {
          color: #c9a84c;
        }

        .ahq-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 38px;
          font-weight: 600;
          color: #fff;
          line-height: 1.15;
          margin: 0 0 8px;
          letter-spacing: -0.5px;
        }

        .ahq-subheading {
          font-size: 14px;
          color: rgba(255,255,255,0.38);
          margin: 0 0 36px;
          line-height: 1.6;
          font-weight: 300;
        }

        .ahq-field {
          margin-bottom: 20px;
        }

        .ahq-label {
          display: block;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.7);
          margin-bottom: 8px;
          font-weight: 500;
        }

        .ahq-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 13px 16px;
          font-size: 15px;
          color: rgba(255,255,255,0.85);
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }

        .ahq-input::placeholder {
          color: rgba(255,255,255,0.18);
        }

        .ahq-input:focus {
          border-color: rgba(201,168,76,0.45);
          background: rgba(201,168,76,0.04);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.08);
        }

        .ahq-btn {
          width: 100%;
          padding: 15px 24px;
          background: linear-gradient(135deg, #c9a84c 0%, #a8883a 100%);
          border: none;
          border-radius: 8px;
          color: #07090f;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          margin-top: 8px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .ahq-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .ahq-btn:hover::before { opacity: 1; }

        .ahq-btn:hover {
          box-shadow: 0 8px 32px rgba(201,168,76,0.35);
          transform: translateY(-1px);
        }

        .ahq-btn:active { transform: scale(0.99); }

        .ahq-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        /* Door icon on button */
        .ahq-btn-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .ahq-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 28px 0 20px;
        }

        .ahq-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.07);
        }

        .ahq-divider-text {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .ahq-roles {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ahq-role-badge {
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 100px;
          padding: 4px 12px;
          letter-spacing: 0.5px;
          cursor: default;
          transition: border-color 0.2s, color 0.2s;
        }

        .ahq-role-badge:hover {
          border-color: rgba(201,168,76,0.3);
          color: rgba(201,168,76,0.6);
        }

        .ahq-footer {
          margin-top: 32px;
          font-size: 11px;
          color: rgba(255,255,255,0.15);
          letter-spacing: 0.5px;
        }

        /* Spinner for loading */
        @keyframes ahq-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .ahq-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(7,9,15,0.3);
          border-top-color: #07090f;
          border-radius: 50%;
          animation: ahq-spin 0.7s linear infinite;
        }
      `}</style>

      <div className="ahq-root">
        <div className="ahq-layout">

          {/* LEFT — DOOR SCENE */}
          <div className="ahq-door-panel">
            <div className="ahq-column-left" />
            <div className="ahq-column-right" />

            {/* Ambient stars */}
            {[
              { top: '12%', left: '18%' }, { top: '22%', left: '72%' },
              { top: '38%', left: '88%' }, { top: '65%', left: '15%' },
              { top: '78%', left: '80%' }, { top: '88%', left: '40%' },
              { top: '8%', left: '55%' }, { top: '50%', left: '30%' },
            ].map((pos, i) => (
              <div key={i} className="ahq-star" style={{ top: pos.top, left: pos.left, opacity: 0.4 + (i % 3) * 0.2 }} />
            ))}

            <div className="ahq-door-label">
              <span className="ahq-door-label-text">Academia HQ</span>
            </div>

            <div className="ahq-door-frame">
              <div className="ahq-door-arch" />
              <div className="ahq-door-arch-inner" />
              <div className="ahq-door-surround">
                <div className="ahq-door-surround-inner" />
              </div>

              {/* Light glow behind door */}
              <div className="ahq-door-glow" />
              <div className="ahq-door-light" />

              {/* The door itself */}
              <div className="ahq-door">
                <div className="ahq-door-panel-top" />
                <div className="ahq-door-panel-bottom" />
                <div className="ahq-keyhole">
                  <div className="ahq-keyhole-circle" />
                  <div className="ahq-keyhole-slot" />
                </div>
              </div>
            </div>

            <div className="ahq-floor" />

            <div className="ahq-door-tagline">
              <p>Your platform awaits</p>
            </div>
          </div>

          {/* RIGHT — FORM */}
          <div className="ahq-form-panel">
            <div className="ahq-brand">
              <div className="ahq-brand-icon">A</div>
              <span className="ahq-brand-name">Academia <span>HQ</span></span>
            </div>

            <h1 className="ahq-heading">
              Welcome<br />back.
            </h1>
            <p className="ahq-subheading">
              Sign in to access your workspace — admin panel, school management, and more.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="ahq-field">
                <label className="ahq-label">Email address</label>
                <input
                  type="email"
                  className="ahq-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@academia.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="ahq-field">
                <label className="ahq-label">Password</label>
                <input
                  type="password"
                  className="ahq-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="ahq-btn" disabled={submitting}>
                {submitting ? (
                  <div className="ahq-spinner" />
                ) : (
                  <>
                    <svg className="ahq-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <polyline points="10 17 15 12 10 7"/>
                      <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Open the door
                  </>
                )}
              </button>
            </form>

            <div className="ahq-divider">
              <div className="ahq-divider-line" />
              <span className="ahq-divider-text">Access levels</span>
              <div className="ahq-divider-line" />
            </div>

            <div className="ahq-roles">
              {['Super Admin', 'School Admin', 'Teacher', 'Student', 'Parent'].map(r => (
                <span key={r} className="ahq-role-badge">{r}</span>
              ))}
            </div>

            <div className="ahq-footer">
              © {new Date().getFullYear()} Academia HQ · CBT & School Management Platform
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
