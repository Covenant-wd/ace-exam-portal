import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function SuperAdminLogin() {
  const { user, role, loading, signIn } = useAuth();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass]   = useState(false);
  const [doorOpen, setDoorOpen]   = useState(false);
  const [mounted, setMounted]     = useState(false);
  const [focused, setFocused]     = useState<"email"|"pass"|null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  if (loading || (user && !role)) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#07090f" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color:"#c9a84c" }} />
      </div>
    );
  }

  if (user && role === "super_admin")      return <Navigate to="/super-admin" replace />;
  if (user && role === "outreach_officer") return <Navigate to="/outreach" replace />;
  if (user && role === "admin")            return <Navigate to="/admin" replace />;
  if (user && role === "instructor")       return <Navigate to="/instructor" replace />;
  if (user && role === "parent")           return <Navigate to="/parent" replace />;
  if (user && role === "student")          return <Navigate to="/student" replace />;
  if (user)                                return <Navigate to="/" replace />;

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
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .sl-root {
          min-height: 100vh;
          min-height: 100dvh;
          background: #07090f;
          display: flex;
          align-items: stretch;
          font-family: 'Outfit', sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* ── ambient background ── */
        .sl-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .sl-bg-orb1 {
          position: absolute;
          width: 600px; height: 600px;
          top: -200px; left: -150px;
          background: radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%);
          border-radius: 50%;
        }
        .sl-bg-orb2 {
          position: absolute;
          width: 500px; height: 500px;
          bottom: -150px; right: -100px;
          background: radial-gradient(circle, rgba(80,100,180,0.07) 0%, transparent 70%);
          border-radius: 50%;
        }
        .sl-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(201,168,76,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201,168,76,0.028) 1px, transparent 1px);
          background-size: 56px 56px;
        }

        /* ── layout ── */
        .sl-wrap {
          position: relative;
          z-index: 1;
          display: flex;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'none' : 'translateY(16px)'};
          transition: opacity 0.7s ease, transform 0.7s ease;
        }

        /* ── LEFT panel — door scene ── */
        .sl-left {
          flex: 0 0 44%;
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(150deg, #111520 0%, #0c1018 100%);
          border-right: 1px solid rgba(201,168,76,0.10);
          position: relative;
          overflow: hidden;
          padding: 60px 40px;
        }

        @media (min-width: 900px) {
          .sl-left { display: flex; }
        }

        /* columns */
        .sl-col { position: absolute; top:0; bottom:0; width:12px; }
        .sl-col-l { left:0; background: linear-gradient(180deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.06) 50%, rgba(201,168,76,0.12) 100%); border-right: 1px solid rgba(201,168,76,0.18); }
        .sl-col-r { right:0; background: linear-gradient(180deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.06) 50%, rgba(201,168,76,0.12) 100%); border-left: 1px solid rgba(201,168,76,0.18); }

        /* stars */
        .sl-star { position: absolute; border-radius: 50%; background: rgba(201,168,76,0.5); animation: sl-twinkle 3s ease-in-out infinite; }
        @keyframes sl-twinkle { 0%,100%{opacity:0.3} 50%{opacity:0.9} }

        /* floor */
        .sl-floor {
          position: absolute;
          bottom: 52px; left: 20px; right: 20px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent);
        }

        /* label above door */
        .sl-door-label {
          position: absolute;
          top: 36px; left: 0; right: 0;
          text-align: center;
          font-family: 'Playfair Display', serif;
          font-size: 11px;
          letter-spacing: 5px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.45);
        }

        /* door scene */
        .sl-scene { position: relative; width: 170px; height: 260px; }

        .sl-arch {
          position: absolute;
          top: 0; left: 0; right: 0; height: 55px;
          border: 2px solid rgba(201,168,76,0.38);
          border-bottom: none;
          border-radius: 85px 85px 0 0;
        }
        .sl-arch-inner {
          position: absolute;
          top: 7px; left: 7px; right: 7px; height: 42px;
          border: 1px solid rgba(201,168,76,0.18);
          border-bottom: none;
          border-radius: 65px 65px 0 0;
        }
        .sl-surround {
          position: absolute;
          top: 33px; left: 0; right: 0; bottom: 0;
          border: 2px solid rgba(201,168,76,0.38);
          border-top: none;
        }
        .sl-surround-inner {
          position: absolute;
          inset: 7px;
          border: 1px solid rgba(201,168,76,0.13);
        }

        .sl-door-glow {
          position: absolute;
          top: 33px; left: 4px; right: 4px; bottom: 0;
          background: radial-gradient(ellipse at center, rgba(201,168,76,0.14), transparent 70%);
          opacity: ${doorOpen ? 1 : 0};
          transition: opacity 0.8s ease 0.5s;
          z-index: 0;
        }
        .sl-door-light {
          position: absolute;
          top: 33px; left: 2px;
          width: 28px; bottom: 2px;
          background: linear-gradient(90deg, rgba(201,168,76,0.18), transparent);
          opacity: ${doorOpen ? 1 : 0};
          transition: opacity 0.7s ease 0.4s;
          z-index: 2;
          pointer-events: none;
        }

        .sl-door {
          position: absolute;
          top: 33px; left: 2px; right: 2px; bottom: 2px;
          transform-origin: left center;
          transform: perspective(700px) rotateY(${doorOpen ? '-72deg' : '0deg'});
          transition: transform 1.3s cubic-bezier(0.4,0,0.2,1);
          background: linear-gradient(145deg, #1c2338 0%, #141928 60%, #1c2338 100%);
          box-shadow: inset -5px 0 14px rgba(0,0,0,0.6), inset 4px 0 8px rgba(201,168,76,0.04);
          z-index: 1;
        }
        .sl-door-p1, .sl-door-p2 {
          position: absolute;
          left: 14px; right: 14px;
          border: 1px solid rgba(201,168,76,0.22);
          border-radius: 2px;
          background: rgba(201,168,76,0.025);
        }
        .sl-door-p1 { top: 14px; height: 66px; }
        .sl-door-p2 { top: 94px; height: 108px; }
        .sl-door-p1::after, .sl-door-p2::after {
          content:''; position:absolute; inset:4px;
          border: 1px solid rgba(201,168,76,0.10);
          border-radius: 1px;
        }
        .sl-keyhole {
          position: absolute;
          right: 16px; top: 50%;
          transform: translateY(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .sl-kh-circle {
          width: 11px; height: 11px;
          border-radius: 50%;
          border: 1.5px solid rgba(201,168,76,0.65);
          background: rgba(201,168,76,0.08);
          box-shadow: 0 0 7px rgba(201,168,76,0.3);
        }
        .sl-kh-slot {
          width: 4px; height: 8px;
          background: rgba(201,168,76,0.45);
          border-radius: 0 0 3px 3px;
          box-shadow: 0 0 5px rgba(201,168,76,0.3);
        }

        .sl-tagline {
          position: absolute;
          bottom: 62px; left: 0; right: 0;
          text-align: center;
          font-family: 'Playfair Display', serif;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.18);
        }

        /* featured quote */
        .sl-quote {
          position: absolute;
          bottom: 80px; left: 28px; right: 28px;
          text-align: center;
          padding-top: 20px;
        }
        .sl-quote p {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          font-size: 13.5px;
          color: rgba(201,168,76,0.35);
          line-height: 1.7;
          letter-spacing: 0.3px;
        }

        /* ── RIGHT panel — form ── */
        .sl-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 40px 24px;
          background: linear-gradient(160deg, #0f1422 0%, #0a0e1a 100%);
          position: relative;
          overflow: hidden;
        }

        @media (min-width: 900px) {
          .sl-right { padding: 60px 64px; align-items: flex-start; }
        }

        /* mobile top bar */
        .sl-mobile-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 36px;
          align-self: flex-start;
        }
        @media (min-width: 900px) {
          .sl-mobile-brand { display: flex; }
        }

        .sl-form-inner {
          width: 100%;
          max-width: 400px;
        }

        .sl-brand-icon {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #c9a84c, #a07830);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 700;
          color: #07090f;
          box-shadow: 0 4px 16px rgba(201,168,76,0.3);
          flex-shrink: 0;
        }
        .sl-brand-text {
          font-family: 'Playfair Display', serif;
          font-size: 18px; font-weight: 600;
          color: rgba(255,255,255,0.88);
          letter-spacing: 0.3px;
        }
        .sl-brand-text span { color: #c9a84c; }

        /* badge */
        .sl-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(201,168,76,0.08);
          border: 1px solid rgba(201,168,76,0.2);
          border-radius: 100px;
          padding: 5px 14px;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.7);
          margin-bottom: 20px;
        }
        .sl-badge-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #c9a84c;
          animation: sl-pulse 2s ease-in-out infinite;
        }
        @keyframes sl-pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }

        .sl-heading {
          font-family: 'Playfair Display', serif;
          font-size: clamp(32px, 5vw, 46px);
          font-weight: 600;
          color: #fff;
          line-height: 1.12;
          margin-bottom: 10px;
          letter-spacing: -0.5px;
        }
        .sl-heading em {
          font-style: italic;
          background: linear-gradient(90deg, #c9a84c, #e8c96a, #c9a84c);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: sl-shimmer 4s linear infinite;
        }
        @keyframes sl-shimmer { to { background-position: 200% center; } }

        .sl-sub {
          font-size: 14px;
          color: rgba(255,255,255,0.35);
          line-height: 1.65;
          margin-bottom: 36px;
          font-weight: 300;
        }

        /* form fields */
        .sl-field { margin-bottom: 18px; }

        .sl-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(201,168,76,0.65);
          font-weight: 500;
        }

        .sl-input-wrap {
          position: relative;
        }
        .sl-input {
          width: 100%;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 14px 44px 14px 16px;
          font-size: 15px;
          color: rgba(255,255,255,0.88);
          font-family: 'Outfit', sans-serif;
          outline: none;
          transition: border-color 0.25s, background 0.25s, box-shadow 0.25s;
        }
        .sl-input::placeholder { color: rgba(255,255,255,0.18); }
        .sl-input:focus {
          border-color: rgba(201,168,76,0.5);
          background: rgba(201,168,76,0.04);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.08), 0 4px 20px rgba(0,0,0,0.3);
        }

        .sl-input-icon {
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.2);
          pointer-events: none;
          display: flex;
          transition: color 0.2s;
        }
        .sl-input:focus ~ .sl-input-icon { color: rgba(201,168,76,0.5); }

        .sl-toggle-pass {
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          color: rgba(255,255,255,0.25);
          cursor: pointer;
          padding: 2px;
          display: flex;
          transition: color 0.2s;
        }
        .sl-toggle-pass:hover { color: rgba(201,168,76,0.6); }

        /* submit */
        .sl-submit {
          width: 100%;
          margin-top: 8px;
          padding: 15px 24px;
          background: linear-gradient(135deg, #c9a84c 0%, #a87830 100%);
          border: none;
          border-radius: 10px;
          color: #07090f;
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          position: relative;
          overflow: hidden;
        }
        .sl-submit::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.18), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .sl-submit:hover::after { opacity: 1; }
        .sl-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(201,168,76,0.38), 0 2px 8px rgba(0,0,0,0.4);
        }
        .sl-submit:active { transform: scale(0.99); }
        .sl-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }

        /* divider */
        .sl-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 28px 0 18px;
        }
        .sl-divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.06); }
        .sl-divider-text { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.18); }

        /* access roles */
        .sl-roles { display: flex; flex-wrap: wrap; gap: 8px; }
        .sl-role {
          font-size: 11px;
          color: rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 100px;
          padding: 5px 13px;
          letter-spacing: 0.3px;
          transition: border-color 0.2s, color 0.2s;
          cursor: default;
        }
        .sl-role:hover { border-color: rgba(201,168,76,0.28); color: rgba(201,168,76,0.55); }

        /* footer */
        .sl-footer {
          margin-top: 36px;
          font-size: 11px;
          color: rgba(255,255,255,0.13);
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sl-footer-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,0.15); flex-shrink: 0; }

        /* spinner */
        @keyframes sl-spin { to { transform: rotate(360deg); } }
        .sl-spinner {
          width: 17px; height: 17px;
          border: 2.5px solid rgba(7,9,15,0.3);
          border-top-color: #07090f;
          border-radius: 50%;
          animation: sl-spin 0.7s linear infinite;
          flex-shrink: 0;
        }
      `}</style>

      <div className="sl-root">
        <div className="sl-bg">
          <div className="sl-bg-orb1" />
          <div className="sl-bg-orb2" />
          <div className="sl-bg-grid" />
        </div>

        <div className="sl-wrap">

          {/* ── LEFT — Door panel ── */}
          <div className="sl-left">
            <div className="sl-col sl-col-l" />
            <div className="sl-col sl-col-r" />

            {/* stars */}
            {[
              {t:"10%",l:"22%",s:2,d:0},{t:"25%",l:"70%",s:1.5,d:1},
              {t:"40%",l:"85%",s:2,d:2},{t:"60%",l:"18%",s:1.5,d:0.5},
              {t:"75%",l:"78%",s:2,d:1.5},{t:"85%",l:"42%",s:1.5,d:2.5},
              {t:"18%",l:"50%",s:1,d:1},{t:"55%",l:"60%",s:1.5,d:0.3},
            ].map((s,i) => (
              <div key={i} className="sl-star" style={{
                top:s.t, left:s.l,
                width:s.s+"px", height:s.s+"px",
                animationDelay:s.d+"s",
                animationDuration:(3+i%2)+"s"
              }} />
            ))}

            <div className="sl-door-label">Academia HQ</div>

            <div className="sl-scene">
              <div className="sl-arch" />
              <div className="sl-arch-inner" />
              <div className="sl-surround">
                <div className="sl-surround-inner" />
              </div>
              <div className="sl-door-glow" />
              <div className="sl-door-light" />
              <div className="sl-door">
                <div className="sl-door-p1" />
                <div className="sl-door-p2" />
                <div className="sl-keyhole">
                  <div className="sl-kh-circle" />
                  <div className="sl-kh-slot" />
                </div>
              </div>
            </div>

            <div className="sl-floor" />
            <div className="sl-tagline">Your platform awaits</div>

            <div className="sl-quote">
              <p>"Empowering schools with intelligence, one login at a time."</p>
            </div>
          </div>

          {/* ── RIGHT — Form ── */}
          <div className="sl-right">
            <div className="sl-form-inner">

              {/* Brand */}
              <div className="sl-mobile-brand">
                <div className="sl-brand-icon">A</div>
                <span className="sl-brand-text">Academia <span>HQ</span></span>
              </div>

              {/* Badge */}
              <div className="sl-badge">
                <div className="sl-badge-dot" />
                Platform Access
              </div>

              {/* Heading */}
              <h1 className="sl-heading">
                Welcome<br /><em>back.</em>
              </h1>
              <p className="sl-sub">
                Sign in to your workspace — manage schools, officers, exams and more from one powerful dashboard.
              </p>

              <form onSubmit={handleSubmit}>
                {/* Email */}
                <div className="sl-field">
                  <label className="sl-label">Email address</label>
                  <div className="sl-input-wrap">
                    <input
                      type="email"
                      className="sl-input"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setFocused("email")}
                      onBlur={() => setFocused(null)}
                      placeholder="you@academia.com"
                      required
                      autoComplete="email"
                    />
                    <span className="sl-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Password */}
                <div className="sl-field">
                  <label className="sl-label">Password</label>
                  <div className="sl-input-wrap">
                    <input
                      type={showPass ? "text" : "password"}
                      className="sl-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setFocused("pass")}
                      onBlur={() => setFocused(null)}
                      placeholder="••••••••••"
                      required
                      minLength={6}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="sl-toggle-pass"
                      onClick={() => setShowPass(p => !p)}
                      tabIndex={-1}
                      aria-label={showPass ? "Hide password" : "Show password"}
                    >
                      {showPass ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button type="submit" className="sl-submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="sl-spinner" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                      Open the door
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="sl-divider">
                <div className="sl-divider-line" />
                <span className="sl-divider-text">Access levels</span>
                <div className="sl-divider-line" />
              </div>

              {/* Role badges */}
              <div className="sl-roles">
                {["Super Admin","School Admin","Outreach Officer","Instructor","Student","Parent"].map(r => (
                  <span key={r} className="sl-role">{r}</span>
                ))}
              </div>

              {/* Footer */}
              <div className="sl-footer">
                <span>© {new Date().getFullYear()} Academia HQ</span>
                <div className="sl-footer-dot" />
                <span>CBT & School Management</span>
                <div className="sl-footer-dot" />
                <span>All rights reserved</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
