"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parisTime } from "@/lib/format";
import { useSession } from "@/components/useSession";

export default function Header() {
  const [time, setTime] = useState("--:--");
  const { session, ready } = useSession();

  useEffect(() => {
    const tick = () => setTime(parisTime());
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="brand">
          <div className="logo" aria-hidden="true">P</div>
          <div>
            <h1>Peron</h1>
            <p>Kašnjenja TGV vozova i utisci putnika iz voza</p>
          </div>
        </Link>
        <div className="top-right">
          {ready && (
            <Link href="/prijava" className="userlink">
              {session ? "Moj nalog" : "Prijava"}
            </Link>
          )}
          <div className="clock num">
            <small>Vreme u Parizu</small>
            {time}
          </div>
        </div>
      </div>
    </header>
  );
}
