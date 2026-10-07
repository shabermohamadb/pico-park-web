// PICO PARK Web - Supabase Google & Guest Authentication

class SupabaseAuthService {
  constructor() {
    this.supabase = null;
    this.isConfigured = false;
    this.user = null;
    this.isGuest = true;
    this.displayName = "Guest";
    this.avatarUrl = null;
    this.listeners = [];
  }

  onAuthChange(cb) {
    if (typeof cb === "function") this.listeners.push(cb);
  }

  notify() {
    const payload = {
      isGuest: this.isGuest,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      user: this.user
    };
    for (const cb of this.listeners) {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async init() {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const config = await res.json();
        if (config.supabaseUrl && config.supabaseAnonKey && typeof window.supabase !== "undefined" && window.supabase.createClient) {
          this.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          this.isConfigured = true;

          this.supabase.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
              this.setUser(session.user);
            } else {
              this.setGuest();
            }
          });

          const { data: { session } } = await this.supabase.auth.getSession();
          if (session && session.user) {
            this.setUser(session.user);
          } else {
            this.setGuest();
          }
          return;
        }
      }
    } catch (err) {
      console.warn("[Auth] Could not initialize Supabase client:", err);
    }
    this.setGuest();
  }

  setUser(user) {
    this.user = user;
    this.isGuest = false;
    const meta = user.user_metadata || {};
    this.displayName = meta.full_name || meta.name || user.email?.split("@")[0] || "Player";
    this.avatarUrl = meta.avatar_url || meta.picture || null;
    this.notify();
  }

  setGuest() {
    this.user = null;
    this.isGuest = true;
    this.displayName = "Guest";
    this.avatarUrl = null;
    this.notify();
  }

  getDisplayName() {
    return this.displayName;
  }

  getAvatarUrl() {
    return this.avatarUrl;
  }

  async signInWithGoogle() {
    if (!this.supabase || !this.isConfigured) {
      if (window.UIManager && window.UIManager.showToast) {
        window.UIManager.showToast("Google sign-in is not configured on this server.", "warning");
      }
      return;
    }
    try {
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error && window.UIManager && window.UIManager.showToast) {
        window.UIManager.showToast(error.message, "error");
      }
    } catch (err) {
      console.error("[Auth] Sign in failed:", err);
    }
  }

  async signOut() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    this.setGuest();
  }
}

window.SupabaseAuth = new SupabaseAuthService();
