import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  Wallet, Users, CheckCircle2, Clock, XCircle, PlusCircle, LogOut,
  Copy, Coins, ClipboardList, ShieldCheck, ChevronRight, Loader2,
  Gift, TrendingUp, X, Link2
} from "lucide-react";

function genReferralCode(username) {
  return (username.slice(0, 4) + Math.random().toString(36).slice(2, 5)).toUpperCase();
}
function emailFor(username) {
  return username.toLowerCase().trim() + "@taskvault.app";
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [subs, setSubs] = useState([]);
  const [allProfiles, setAllProfiles] = useState({});

  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", referral: "" });
  const [authErr, setAuthErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState("tasks");
  const [modalTask, setModalTask] = useState(null);
  const [proofText, setProofText] = useState("");
  const [toast, setToast] = useState(null);
  const [newTask, setNewTask] = useState({ title: "", category: "Survey", reward: 50, description: "", instructions: "" });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(data || null);
  }, []);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from("tasks").select("*").eq("status", "active").order("created_at", { ascending: false });
    setTasks(data || []);
  }, []);

  const loadSubs = useCallback(async () => {
    const { data } = await supabase.from("submissions").select("*").order("submitted_at", { ascending: false });
    setSubs(data || []);
  }, []);

  const loadProfilesMap = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id,username,referred_by");
    const map = {};
    (data || []).forEach((p) => { map[p.id] = p; });
    setAllProfiles(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await loadProfile(session.user.id);
      await loadTasks();
      await loadSubs();
      await loadProfilesMap();
      setBooting(false);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id);
      else setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, loadTasks, loadSubs, loadProfilesMap]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthErr("");
    const uname = form.username.trim().toLowerCase();
    if (!uname || !form.password) { setAuthErr("Username aur password required hai."); return; }
    setSaving(true);
    try {
      if (authMode === "signup") {
        let referrerId = null;
        if (form.referral.trim()) {
          const { data: ref } = await supabase.from("profiles").select("id,points").eq("referral_code", form.referral.trim().toUpperCase()).single();
          if (!ref) { setAuthErr("Referral code galat hai."); setSaving(false); return; }
          referrerId = ref.id;
        }
        const { data: authData, error } = await supabase.auth.signUp({ email: emailFor(uname), password: form.password });
        if (error) { setAuthErr(error.message); setSaving(false); return; }
        if (!authData.user) { setAuthErr("Signup ho gaya, ab login karein."); setAuthMode("login"); setSaving(false); return; }
        const { error: profErr } = await supabase.from("profiles").insert({
          id: authData.user.id,
          username: uname,
          points: referrerId ? 150 : 100,
          referral_code: genReferralCode(uname),
          referred_by: referrerId,
          is_admin: false,
        });
        if (profErr) { setAuthErr(profErr.message); setSaving(false); return; }
        if (referrerId) {
          const { data: refProfile } = await supabase.from("profiles").select("points").eq("id", referrerId).single();
          if (refProfile) await supabase.from("profiles").update({ points: refProfile.points + 50 }).eq("id", referrerId);
        }
        await loadProfile(authData.user.id);
        await loadProfilesMap();
        showToast(`Welcome ${uname}! Bonus points mil gaye.`);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(uname), password: form.password });
        if (error) { setAuthErr("Username ya password galat hai."); setSaving(false); return; }
        await loadProfile(data.user.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setForm({ username: "", password: "", referral: "" });
  };

  const submitProof = async () => {
    if (!modalTask || !proofText.trim() || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("submissions").insert({
      task_id: modalTask.id,
      task_title: modalTask.title,
      reward: modalTask.reward,
      user_id: profile.id,
      username: profile.username,
      proof: proofText.trim(),
      status: "pending",
    });
    setSaving(false);
    if (error) { showToast("Error: " + error.message); return; }
    await loadSubs();
    setModalTask(null);
    setProofText("");
    showToast("Proof submit ho gaya. Admin approval ka wait karein.");
  };

  const mySubs = subs.filter((s) => s.user_id === profile?.id);
  const alreadyApplied = (taskId) => mySubs.some((s) => s.task_id === taskId && s.status !== "rejected");

  const decideSubmission = async (sub, decision) => {
    await supabase.from("submissions").update({ status: decision }).eq("id", sub.id);
    if (decision === "approved") {
      const { data: owner } = await supabase.from("profiles").select("points").eq("id", sub.user_id).single();
      if (owner) await supabase.from("profiles").update({ points: owner.points + sub.reward }).eq("id", sub.user_id);
      if (sub.user_id === profile.id) await loadProfile(profile.id);
    }
    await loadSubs();
    showToast(decision === "approved" ? "Submission approve ho gayi." : "Submission reject ho gayi.");
  };

  const addTask = async () => {
    if (!newTask.title.trim() || !newTask.reward) return;
    const { error } = await supabase.from("tasks").insert({ ...newTask, reward: Number(newTask.reward), status: "active" });
    if (error) { showToast("Error: " + error.message); return; }
    await loadTasks();
    setNewTask({ title: "", category: "Survey", reward: 50, description: "", instructions: "" });
    showToast("Naya task add ho gaya.");
  };

  const referredUsers = profile ? Object.values(allProfiles).filter((p) => p.referred_by === profile.id) : [];
  const pendingCount = subs.filter((s) => s.status === "pending").length;

  const copyRef = () => {
    if (!profile) return;
    navigator.clipboard?.writeText(profile.referral_code).catch(() => {});
    showToast("Referral code copy ho gaya.");
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1526" }}>
        <Loader2 className="animate-spin" color="#E8B84B" size={28} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "#0B1526" }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#E8B84B" }}>
              <Coins size={18} color="#0B1526" />
            </div>
            <span className="text-xl font-bold" style={{ color: "#EDF1F7" }}>TaskVault</span>
          </div>
          <div className="rounded-2xl p-6" style={{ background: "#121F35", border: "1px solid #223354" }}>
            <div className="flex mb-6 rounded-lg overflow-hidden" style={{ background: "#0B1526" }}>
              {["login", "signup"].map((m) => (
                <button key={m} onClick={() => { setAuthMode(m); setAuthErr(""); }}
                  className="flex-1 py-2 text-sm font-medium transition"
                  style={{ background: authMode === m ? "#E8B84B" : "transparent", color: authMode === m ? "#0B1526" : "#7E8CA6" }}>
                  {m === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>
            <form onSubmit={handleAuth} className="space-y-3">
              <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: "#0B1526", border: "1px solid #223354", color: "#EDF1F7" }} />
              <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: "#0B1526", border: "1px solid #223354", color: "#EDF1F7" }} />
              {authMode === "signup" && (
                <input placeholder="Referral code (optional)" value={form.referral} onChange={(e) => setForm({ ...form, referral: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: "#0B1526", border: "1px solid #223354", color: "#EDF1F7" }} />
              )}
              {authErr && <p className="text-xs" style={{ color: "#F87171" }}>{authErr}</p>}
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: "#E8B84B", color: "#0B1526" }}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : authMode === "login" ? "Log in" : "Create account"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const NAV = [
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "submissions", label: "My Submissions", icon: CheckCircle2 },
    { id: "referrals", label: "Referrals", icon: Gift },
    ...(profile.is_admin ? [{ id: "admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0B1526" }}>
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between" style={{ background: "#0B1526", borderBottom: "1px solid #223354" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "#E8B84B" }}>
            <Coins size={14} color="#0B1526" />
          </div>
          <span className="font-bold text-sm" style={{ color: "#EDF1F7" }}>TaskVault</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ background: "#121F35", border: "1px solid #223354" }}>
            <Wallet size={13} color="#E8B84B" />
            <span className="text-xs font-bold" style={{ color: "#E8B84B" }}>{profile.points}</span>
          </div>
          <button onClick={logout} className="p-1.5 rounded-md" style={{ color: "#7E8CA6" }}><LogOut size={16} /></button>
        </div>
      </header>

      <div className="px-4 pt-4">
        <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #16243A, #121F35)", border: "1px solid #223354" }}>
          <div>
            <p className="text-[11px] tracking-wide uppercase" style={{ color: "#7E8CA6" }}>Wallet balance</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: "#EDF1F7" }}>{profile.points} <span className="text-xs font-normal" style={{ color: "#7E8CA6" }}>pts</span></p>
            <p className="text-[11px] mt-0.5" style={{ color: "#4A5872" }}>≈ Rs {(profile.points * 0.1).toFixed(0)} (demo rate)</p>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#0B1526" }}>
            <TrendingUp size={18} color="#34D399" />
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 flex gap-2 overflow-x-auto">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap"
            style={{ background: tab === n.id ? "#E8B84B" : "#121F35", color: tab === n.id ? "#0B1526" : "#7E8CA6", border: "1px solid " + (tab === n.id ? "#E8B84B" : "#223354") }}>
            <n.icon size={13} />{n.label}
            {n.id === "admin" && pendingCount > 0 && <span className="ml-0.5 px-1.5 rounded-full text-[10px]" style={{ background: "#F87171", color: "#0B1526" }}>{pendingCount}</span>}
          </button>
        ))}
      </div>

      <main className="px-4 py-5 pb-16">
        {tab === "tasks" && (
          <div className="space-y-3">
            {tasks.map((t) => {
              const applied = alreadyApplied(t.id);
              return (
                <div key={t.id} className="rounded-xl p-4" style={{ background: "#121F35", border: "1px solid #223354" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#0B1526", color: "#34D399", border: "1px solid #223354" }}>{t.category}</span>
                      <h3 className="mt-2 text-sm font-semibold" style={{ color: "#EDF1F7" }}>{t.title}</h3>
                      <p className="text-xs mt-1" style={{ color: "#7E8CA6" }}>{t.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 justify-end">
                        <Coins size={12} color="#E8B84B" />
                        <span className="text-sm font-bold" style={{ color: "#E8B84B" }}>{t.reward}</span>
                      </div>
                    </div>
                  </div>
                  <button disabled={applied} onClick={() => setModalTask(t)}
                    className="mt-3 w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                    style={{ background: applied ? "#0B1526" : "#E8B84B", color: applied ? "#4A5872" : "#0B1526", border: applied ? "1px solid #223354" : "none" }}>
                    {applied ? "Already submitted" : "Submit proof"}{!applied && <ChevronRight size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "submissions" && (
          <div className="space-y-2.5">
            {mySubs.length === 0 && <EmptyState text="Abhi tak koi submission nahi hai." />}
            {mySubs.map((s) => (
              <div key={s.id} className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: "#121F35", border: "1px solid #223354" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#EDF1F7" }}>{s.task_title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#4A5872" }}>{new Date(s.submitted_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        )}

        {tab === "referrals" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "#121F35", border: "1px solid #223354" }}>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: "#7E8CA6" }}>Your referral code</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xl font-bold" style={{ color: "#E8B84B" }}>{profile.referral_code}</span>
                <button onClick={copyRef} className="p-2 rounded-lg" style={{ background: "#0B1526", border: "1px solid #223354" }}><Copy size={14} color="#7E8CA6" /></button>
              </div>
              <p className="text-xs mt-2" style={{ color: "#4A5872" }}>Har naye signup pe aapko +50 points milte hain.</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: "#7E8CA6" }}><Users size={13} /> Referred users ({referredUsers.length})</p>
              {referredUsers.length === 0 && <EmptyState text="Abhi tak kisi ne aapka code use nahi kiya." />}
              <div className="space-y-2">
                {referredUsers.map((u) => (
                  <div key={u.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "#121F35", border: "1px solid #223354" }}>
                    <span className="text-sm" style={{ color: "#EDF1F7" }}>{u.username}</span>
                    <span className="text-xs" style={{ color: "#34D399" }}>+50 pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "admin" && profile.is_admin && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "#7E8CA6" }}>Pending submissions ({pendingCount})</p>
              <div className="space-y-2.5">
                {subs.filter((s) => s.status === "pending").length === 0 && <EmptyState text="Koi pending submission nahi hai." />}
                {subs.filter((s) => s.status === "pending").map((s) => (
                  <div key={s.id} className="rounded-xl p-3.5" style={{ background: "#121F35", border: "1px solid #223354" }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold" style={{ color: "#EDF1F7" }}>{s.task_title}</p>
                      <span className="text-xs" style={{ color: "#E8B84B" }}>+{s.reward} pts</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "#4A5872" }}>by {s.username}</p>
                    <p className="text-xs mt-2 p-2 rounded-lg" style={{ background: "#0B1526", color: "#7E8CA6" }}>{s.proof}</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => decideSubmission(s, "approved")} className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "#34D399", color: "#0B1526" }}>Approve</button>
                      <button onClick={() => decideSubmission(s, "rejected")} className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "#F87171", color: "#0B1526" }}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "#7E8CA6" }}>Add new task</p>
              <div className="rounded-xl p-4 space-y-2.5" style={{ background: "#121F35", border: "1px solid #223354" }}>
                <input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "#0B1526", border: "1px solid #223354", color: "#EDF1F7" }} />
                <div className="flex gap-2">
                  <select value={new
