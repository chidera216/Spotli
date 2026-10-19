import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Play } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/useAuth";

const backgroundImage =
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=85";

function Signup() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);

    const userData = {
      firstName: formData.get("firstName")?.trim(),
      lastName: formData.get("lastName")?.trim(),
      email: formData.get("email")?.trim(),
      password: formData.get("password"),
    };

    setIsSubmitting(true);
    setMessage("");

    try {
      await api.auth.register(userData);
      const currentUser = await refreshUser();

      if (!currentUser) {
        setMessage(
          "Your account was created, but we couldn't verify your session. Please log in.",
        );
        return;
      }

      navigate("/home", { replace: true });
    } catch (error) {
      setMessage(error.message || "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleSignup() {
    setMessage("Google sign-up is not connected yet.");
  }

  return (
    <main className="relative min-h-svh overflow-x-hidden bg-[#17171b] text-white md:grid md:h-screen md:min-h-0 md:grid-cols-2 md:overflow-hidden">
      {/* Mobile background */}
      <div
        className="absolute inset-0 bg-cover bg-center md:hidden"
        style={{ backgroundImage: `url("${backgroundImage}")` }}
      />

      <div className="absolute inset-0 bg-linear-to-b from-black/35 via-[#17171b]/75 to-[#17171b]/95 md:hidden" />

      {/* Left image panel */}
      <section
        className="relative hidden min-h-0 overflow-hidden bg-cover bg-center md:block"
        style={{ backgroundImage: `url("${backgroundImage}")` }}
      >
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-black/15" />

        <div className="absolute left-10 top-8 z-10 lg:left-14 lg:top-10">
          <Link to="/login" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d4a]">
              <Play size={21} fill="white" />
            </span>

            <span className="text-2xl font-bold tracking-tight">
              spotli<span className="text-[#ff2d4a]">.</span>
            </span>
          </Link>
        </div>

        <div className="absolute bottom-10 left-10 z-10 max-w-lg lg:bottom-14 lg:left-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#ff6578]">
            YOUR PEOPLE. YOUR MOMENTS.
          </p>

          <h2 className="text-4xl font-bold leading-tight lg:text-6xl">
            Life happens.
            <br />
            Spotli it.
          </h2>

          <p className="mt-4 max-w-md text-sm leading-6 text-white/80 lg:text-base">
            Discover moments, share your world, and stay connected to the people
            around you.
          </p>
        </div>
      </section>

      {/* Right form panel */}
      <section
        className="relative flex min-h-svh items-center justify-center overflow-hidden px-5 py-8 sm:px-10 md:h-screen md:min-h-0 md:px-8 md:py-5 lg:px-14"
        style={{
          backgroundImage: `url("${backgroundImage}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-linear-to-r from-[#17171b]/65 via-[#17171b]/85 to-[#17171b]/95" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-[#17171b]/45" />

        <div className="relative z-10 w-full max-w-md">
          {/* Mobile brand */}
          <Link
            to="/login"
            className="mb-6 inline-flex items-center gap-2 md:hidden"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d4a]">
              <Play size={21} fill="white" />
            </span>

            <span className="text-2xl font-bold tracking-tight">
              spotli<span className="text-[#ff2d4a]">.</span>
            </span>
          </Link>

          {/* Google signup */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-black/25 px-4 py-3.5 text-sm font-medium transition hover:bg-white/10"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="my-4 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/15" />

            <span className="text-[11px] tracking-wide text-white/45">
              OR SIGN UP WITH EMAIL
            </span>

            <div className="h-px flex-1 bg-white/15" />
          </div>

          {/* Signup form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-2 block text-sm font-medium text-white/85"
                >
                  First name
                </label>

                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  maxLength={50}
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="mb-2 block text-sm font-medium text-white/85"
                >
                  Last name
                </label>

                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  maxLength={50}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="signupEmail"
                className="mb-2 block text-sm font-medium text-white/85"
              >
                Email address
              </label>

              <input
                id="signupEmail"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="signupPassword"
                className="mb-2 block text-sm font-medium text-white/85"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="signupPassword"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={128}
                  required
                  className={`${inputClass} pr-12`}
                />

                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/60 transition hover:text-white"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 pt-1 text-xs leading-5 text-white/70">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                className="mt-1 accent-[#ff2d4a]"
              />

              <span>
                I agree to Spotli&apos;s{" "}
                <a
                  href="#terms"
                  className="text-white underline underline-offset-2"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="#privacy"
                  className="text-white underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#ff2d4a] px-4 py-3.5 font-semibold transition hover:bg-[#e9223f] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-xl border border-white/15 bg-black/40 p-3 text-sm leading-5 text-white/85"
            >
              {message}
            </p>
          )}

          <p className="mt-5 text-center text-sm text-white/70">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-[#ff6578] transition hover:text-[#ff2d4a]"
            >
              Log in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/20 bg-black/35 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-[#ff2d4a] focus:ring-2 focus:ring-[#ff2d4a]/25";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        transform="translate(0 4)"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.98 46.98 31.88 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"
        transform="translate(1 0)"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
        transform="translate(0 -3)"
      />
    </svg>
  );
}

export default Signup;
