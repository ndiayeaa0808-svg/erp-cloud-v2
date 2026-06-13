"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Eye, EyeOff, LogIn, ExternalLink, CheckCircle2, Building2, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasValidConfig, getSupabaseConfig, storeConfig } from "@/lib/supabase/config";
import { isOnlineSync } from "@/lib/is-online";
import { cacheSession, hasValidCachedSession } from "@/lib/offline-auth";
import { refreshCache } from "@/lib/sync/sync";
import { ADMIN_PERMS } from "@/lib/constants";

export default function LoginPage() {
  const [configured, setConfigured] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "register" | "admin">("login");

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adminEmail, setAdminEmail] = useState("");

  const setAdminLocalStorage = () => {
    localStorage.setItem("shop_id", "admin");
    localStorage.setItem("user_role", "admin");
    localStorage.setItem("user_perms", JSON.stringify(ADMIN_PERMS));
  };
  const [licenseCode, setLicenseCode] = useState("");
  const [licenseValid, setLicenseValid] = useState(false);
  const [licensePlan, setLicensePlan] = useState("");
  const [licenseChecking, setLicenseChecking] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const valid = hasValidConfig();
    setConfigured(valid);
    if (valid && !isOnline && hasValidCachedSession()) {
      window.location.href = "/";
      return;
    }
    setChecking(false);
  }, []);

  const isElectron = typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");
  const [isOnline, setIsOnline] = useState(isElectron || isOnlineSync());

  useEffect(() => {
    setIsOnline(isElectron || isOnlineSync());
    if (isElectron) return;
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [isElectron]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline && !isElectron) {
      setError("Connexion Internet requise pour se connecter");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const config = getSupabaseConfig();
      if (!config) {
        setError("Supabase non configuré. Configurez d'abord votre projet.");
        return;
      }

      // Nettoyer toute session et cache précédents
      const supabase = createClient();
      await supabase.auth.signOut().catch(() => {});
      localStorage.removeItem("shop_id");

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
        return;
      }

      // Forcer le shop_id dans le localStorage
      if (data.user?.shop_id) {
        localStorage.setItem("shop_id", data.user.shop_id);
      }
      if (data.user?.perms) {
        localStorage.setItem("user_perms", JSON.stringify(data.user.perms));
      }
      if (data.user?.role) {
        localStorage.setItem("user_role", data.user.role);
      }

      // Définir la nouvelle session
      await supabase.auth.setSession(data.session);

      // Activer la licence si un code était stocké dans les metadata
      const metadata = data.session?.user?.user_metadata;
      if (metadata?.license_code && data.user?.shop_id) {
        fetch("/api/licenses/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: data.user.shop_id, licenseCode: metadata.license_code }),
        }).catch(() => {});
      }

      // Cacher la session pour le mode hors-ligne
      if (data.session) {
        cacheSession({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 3600000,
          user: {
            id: data.session.user?.id || "",
            email: data.session.user?.email,
            user_metadata: data.session.user?.user_metadata,
            app_metadata: data.session.user?.app_metadata,
          },
          shopId: data.user?.shop_id || "",
          userInfo: data.user || {},
        });
      }

      await refreshCache();
      window.location.href = "/";
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut().catch(() => {});
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      });
      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("user not found")) {
          try {
            const setupRes = await fetch("/api/admin/setup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: adminEmail, password }),
            });
            const setupData = await setupRes.json();
            if (!setupRes.ok) {
              setError(setupData.error || "Impossible de créer le compte admin");
              return;
            }
            const retry = await supabase.auth.signInWithPassword({ email: adminEmail, password });
            if (retry.error) { setError(retry.error.message); return; }
            setAdminLocalStorage();
            window.location.href = "/";
            return;
          } catch {
            setError("Erreur lors de la création du compte. Vérifie que le serveur est bien relancé après l'ajout du .env.local");
            return;
          }
        }
        setError(signInError.message);
        return;
      }
        setAdminLocalStorage();
      window.location.href = "/";
    } catch { setError("Erreur de connexion"); }
    setLoading(false);
  };

  const handleCheckLicense = async () => {
    if (!licenseCode.trim()) return;
    setLicenseChecking(true);
    try {
      const res = await fetch("/api/licenses/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: licenseCode.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setLicenseValid(true);
        setLicensePlan(data.plan);
        setError(null);
      } else {
        setLicenseValid(false);
        setLicensePlan("");
        setError(data.error || "Code invalide");
      }
    } catch {
      setError("Erreur de validation");
    }
    setLicenseChecking(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline && !isElectron) {
      setError("Connexion Internet requise pour créer un compte");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const config = getSupabaseConfig();
      if (!config) {
        setError("Supabase non configuré. Configurez d'abord votre projet.");
        return;
      }

      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: `${login}@boutique.local`,
        password,
        options: {
          data: {
            shop_name: shopName || "Ma Boutique",
            full_name: fullName || login,
            login: login,
            license_code: licenseCode.trim(),
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setLicenseCode("");
      setLicenseValid(false);
      setMode("login");
      setError("Compte créé ! Connectez-vous avec vos identifiants.");
    } catch {
      setError("Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    if (!supabaseUrl.includes("supabase.co")) {
      setError("L'URL doit contenir 'supabase.co'");
      setSaving(false);
      return;
    }
    if (!supabaseKey.startsWith("eyJ")) {
      setError("La clé anon doit commencer par 'eyJ...'");
      setSaving(false);
      return;
    }

    storeConfig({ url: supabaseUrl, anonKey: supabaseKey });
    setSaveSuccess(true);
    setTimeout(() => {
      setConfigured(true);
    }, 500);
    setSaving(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Vérification de la configuration...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 text-2xl font-bold">
              ✦
            </div>
          </div>
          <CardTitle className="text-xl">ERP Cloud</CardTitle>
          <CardDescription>
            {!configured
              ? "Configurez votre projet Supabase"
              : mode === "admin"
                ? "Connexion administrateur"
                : mode === "login"
                  ? "Connectez-vous à votre boutique"
                  : "Créez votre boutique"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Vous avez besoin d&apos;un projet Supabase pour utiliser l&apos;ERP.
                  Créez-en un gratuitement sur{" "}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 underline underline-offset-2"
                  >
                    supabase.com
                  </a>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="supabaseUrl">URL du projet Supabase</Label>
                <Input
                  id="supabaseUrl"
                  placeholder="https://xxxxx.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supabaseKey">Clé anon public</Label>
                <Input
                  id="supabaseKey"
                  placeholder="eyJ..."
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                />
              </div>

              {saveSuccess && (
                <Alert className="border-emerald-500/50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <AlertDescription className="text-emerald-500">
                    Configuration enregistrée !
                  </AlertDescription>
                </Alert>
              )}

              {error && !saveSuccess && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSaveConfig}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Enregistrement..." : "✅ Enregistrer & continuer"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-amber-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ouvrir le dashboard Supabase
                </a>
              </p>

              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Instructions :</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Allez sur supabase.com → New Project</li>
                  <li>Dans SQL Editor, exécutez le contenu de <code className="text-amber-400">supabase-schema.sql</code></li>
                  <li>Settings → API → copiez Project URL + anon public</li>
                </ol>
              </div>
            </div>
          ) : !isOnline && !isElectron ? (
            <div className="space-y-4 text-center py-6">
              <WifiOff className="h-12 w-12 mx-auto text-red-400" />
              <p className="text-muted-foreground">Connexion Internet requise pour se connecter</p>
              <p className="text-xs text-muted-foreground">Connectez-vous d'abord en ligne, l'application fonctionnera ensuite hors-ligne.</p>
            </div>
          ) : mode === "admin" ? (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm font-medium text-amber-400">Connexion administrateur</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="ndiayeaO8@gmail.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPassword">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion..." : <><LogIn className="mr-2 h-4 w-4" /> Connexion admin</>}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); setPassword(""); }}
                  className="text-xs text-muted-foreground hover:text-amber-400 underline underline-offset-2"
                >
                  Retour connexion boutique
                </button>
              </div>
            </form>
          ) : mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login">Identifiant</Label>
                <Input
                  id="login"
                  type="text"
                  placeholder="admin"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion..." : <><LogIn className="mr-2 h-4 w-4" /> Se connecter</>}
              </Button>

              <div className="text-center space-y-1">
                <button
                  type="button"
                  onClick={() => { setMode("register"); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-amber-400 underline underline-offset-2 block"
                >
                  Pas encore de compte ? Créer ma boutique
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("admin"); setError(null); }}
                  className="text-xs text-muted-foreground/50 hover:text-amber-400 underline underline-offset-2 block"
                >
                  Administrateur
                </button>
              </div>
            </form>
          ) : !licenseValid ? (
            <form onSubmit={(e) => { e.preventDefault(); handleCheckLicense(); }} className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Vous devez avoir un code de licence pour créer votre boutique.
                  Contactez l'administrateur pour en obtenir un.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="licenseCode">Code de licence</Label>
                <Input
                  id="licenseCode"
                  type="text"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={licenseCode}
                  onChange={(e) => { setLicenseCode(e.target.value); setLicenseValid(false); setError(null); }}
                  className="text-center font-mono text-lg tracking-wider"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={licenseChecking}>
                {licenseChecking ? "Vérification..." : "Valider le code"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-amber-400 underline underline-offset-2"
                >
                  Déjà un compte ? Se connecter
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <Alert className="border-emerald-500/50">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <AlertDescription className="text-xs text-emerald-500">
                  Code valide &mdash; Plan : {licensePlan === "trial" ? "Essai 7 jours" :
                    licensePlan === "monthly" ? "Mensuel" :
                    licensePlan === "quarterly" ? "Trimestriel" :
                    licensePlan === "semi_annual" ? "Semestriel" : "À vie"}
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="shopName">Nom de la boutique</Label>
                <Input
                  id="shopName"
                  placeholder="Ma Boutique"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nom du gérant</Label>
                <Input
                  id="fullName"
                  placeholder="Votre nom"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regLogin">Identifiant</Label>
                <Input
                  id="regLogin"
                  type="text"
                  placeholder="admin"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regPassword">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="regPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Création..." : <><Building2 className="mr-2 h-4 w-4" /> Créer ma boutique</>}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-amber-400 underline underline-offset-2"
                >
                  Déjà un compte ? Se connecter
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
