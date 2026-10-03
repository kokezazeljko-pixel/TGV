"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Returns the current sign-in session and follows sign-in / sign-out
export function useSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, ready };
}
